const maxFileBytes = 50 * 1024 * 1024;
export const maxBackupBytes = 128 * 1024 * 1024;
const bucket = 'design-files';

export async function getCloud() {
  const response = await fetch('/workspace/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('config');
  const { url, publishableKey } = await response.json();
  const endpoint = new URL(url);
  // Accept only a public Supabase publishable key. The config file is served to the browser.
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(endpoint.origin, publishableKey, {
    auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
  });
}

function result({ data, error }) {
  if (error) throw error;
  return data;
}

async function list(query) {
  const pageSize = 500;
  const records = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = result(await query.range(offset, offset + pageSize - 1));
    records.push(...page);
    if (page.length < pageSize) return records;
  }
}

export function projectStore(client, owner) {
  const objects = client.storage.from(bucket);
  const projects = client.from('design_projects');
  const files = client.from('design_project_files');
  const versions = client.from('design_file_versions');

  return {
    async listProjects() {
      return list(projects.select('id, name').order('created_at', { ascending: false }).order('id'));
    },
    async createProject(name) {
      return result(await projects.insert({ name }).select('id, name').single());
    },
    async renameProject(id, name) {
      return result(await projects.update({ name }).eq('id', id).select('id, name').single());
    },
    async listFiles(project) {
      return list(files.select('*').eq('project_id', project.id).order('created_at', { ascending: false }).order('id'));
    },
    async listVersions(file) {
      return list(versions.select('*').eq('file_id', file.id).order('version_number', { ascending: false }));
    },
    async projectVersions(project) {
      return list(versions.select('*, design_files!design_file_versions_file_id_fkey!inner(name, project_id)')
        .eq('design_files.project_id', project.id).order('file_id').order('version_number'));
    },
    async download(version) {
      return result(await objects.download(version.object_path));
    },
    async save(project, blob, name, file) {
      const filename = (file?.name ?? name).trim();
      if (!filename || filename.length > 180 || /[\\/\x00-\x1f\x7f]/.test(filename)) throw new Error('filename');
      if (!blob.size || blob.size > maxFileBytes) throw new Error('filesize');

      const fileId = file?.id ?? crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const path = [owner, project.id, fileId, versionId].join('/');
      const contentType = 'application/octet-stream';
      result(await objects.upload(path, new Blob([blob], { type: contentType }), { contentType, cacheControl: '0', upsert: false }));
      const args = {
        p_project_id: project.id,
        p_file_id: fileId,
        p_name: filename,
        p_version_id: versionId,
        p_expected_version: file?.latest_version_id ?? null,
        p_size_bytes: blob.size,
      };
      let response = await client.rpc('save_design_version', args);
      if (response.error && (!response.status || response.status >= 500)) {
        response = await client.rpc('save_design_version', args);
      }
      result(response);
      return { id: fileId, name: filename, latest_version_id: versionId, object_path: path };
    },
  };
}
