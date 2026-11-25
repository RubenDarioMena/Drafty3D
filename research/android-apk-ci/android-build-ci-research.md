# Feasibility of a signed Capacitor Android APK build in GitHub Actions

Research ticket: [#6](https://github.com/RubenDarioMena/Drafty3D/issues/6) (child of map issue [#3](https://github.com/RubenDarioMena/Drafty3D/issues/3)).

**Verdict up front: the plan is sound.** Building a signed Capacitor Android
APK in GitHub Actions on `ubuntu-latest` is a well-trodden path with no
exotic dependencies. The Android-SDK/Gradle-server block this agent has hit
in its own sandbox is a property of *this sandbox's* network policy, not of
GitHub-hosted runners — GitHub's own runner images ship the Android SDK,
NDK, cmdline-tools and Gradle preinstalled, so a workflow may not even need
to reach `dl.google.com` / `services.gradle.org` at all for a normal build.

(Side note, not part of the 5 questions: from *this* sandbox, `dl.google.com`,
`services.gradle.org` and `maven.google.com` all returned HTTP 200/307 today
when probed with `curl`, and `npm info @capacitor/android` / `npm info
@capacitor/cli` resolved fine — so even the "blocked in the past" premise may
no longer hold here. Either way it is irrelevant to GitHub-hosted runners,
which are a separate network entirely.)

---

## 1. Are the Android SDK / Gradle servers (or GitHub's own setup actions) reachable from GitHub-hosted runners?

Yes, and more strongly than the ticket assumed: GitHub's `ubuntu-24.04`
(and current `ubuntu-latest`) hosted runner image comes with the Android
toolchain **already installed**, per the official `runner-images` repo
README (`actions/runner-images`, `images/ubuntu/Ubuntu2404-Readme.md`,
https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md):

- Android SDK at `/usr/local/lib/android/sdk`, exposed as both `ANDROID_HOME`
  and `ANDROID_SDK_ROOT`; Platform-Tools 37.0.1.
- Android command-line tools (sdkmanager) version 12.0.
- Android NDK, three side-by-side versions (27.3.x default, 29.0.x, 30.0.x).
- Gradle 9.9.1 preinstalled (a project's own Gradle Wrapper is still what
  actually gets used, per the `gradlew` invocation below, but the point is
  the runner has no trouble fetching/running Gradle).
- Five JDKs preinstalled (8, 11, 17, 21, 25), each exposed via
  `JAVA_HOME_<N>_X64`, with 17 as the image default — which happens to be
  exactly what AGP 8.x requires (see §4).

So in the common case a workflow doesn't even need an explicit SDK-setup
action — it just needs to make sure the right **SDK platform** (e.g.
android-35) and **build-tools** are installed, which Capacitor's own Gradle
scripts do automatically on first `./gradlew` invocation by talking to
Google's Maven/SDK servers, which GitHub-hosted runners can reach without
restriction (this is standard, extensively-used CI traffic — Google's own
Android CI samples, every Capacitor/Ionic/Flutter CI guide found during this
research, and the `android-actions/setup-android` action's own purpose all
depend on this reachability).

For belt-and-suspenders control (pinning the cmdline-tools version,
explicitly accepting licenses non-interactively, installing specific SDK
packages beyond what the image ships), `android-actions/setup-android`
(https://github.com/android-actions/setup-android) remains the standard
action. Per its README:

- It downloads/installs the SDK cmdline-tools only if the pinned version
  isn't already present in `$ANDROID_SDK_ROOT`/`$HOME/.android/sdk` — so on
  GitHub-hosted runners it's mostly a no-op license-acceptance + extra
  packages step, not a from-scratch SDK download.
- Inputs: `packages` (default `platform-tools`), `cmdline-tools-version`
  (default build `15859902`, i.e. short version 22.0), and
  `accept-android-sdk-licenses` (default `yes`).
- Usage examples reference `android-actions/setup-android@v4`; third-party
  aggregators (ecosyste.ms, devops-actions marketplace news) report a
  `v4.0.1` tag as of April 2026, but I could not independently confirm the
  exact latest tag directly on GitHub's own Releases page through the tools
  available here — **pin to the newest `v4.x.y` tag you can confirm on
  https://github.com/android-actions/setup-android/releases at workflow-write
  time**, don't take `v4.0.1` as gospel from this research alone.

Caveat worth flagging: an older `actions/runner-images` issue (#7506, from
the AGP 8.2-alpha era) reported sdkmanager license-acceptance failures on
the image; that's old and likely stale given the current image ships
licenses pre-accepted for the preinstalled packages, but it's a reason to
keep `accept-android-sdk-licenses: yes` (or the equivalent manual
`yes | sdkmanager --licenses`) in the workflow as a safety net rather than
assuming it's unnecessary.

**Conclusion:** reachability is not a real risk on GitHub-hosted runners.
The sandbox-specific block in this agent's own environment does not transfer
to Actions.

---

## 2. Minimal Capacitor Android build steps, end to end, including signing wiring

Sequence (standard Capacitor flow, confirmed against official
capacitorjs.com docs for the `cap add`/`cap open` commands, and against
numerous working CI examples for `cap sync` + Gradle):

1. `npm ci` — install JS deps (Capacitor packages: `@capacitor/core`,
   `@capacitor/cli`, `@capacitor/android`).
2. `npm run build` — the existing Vite build (`scripts/build.mjs` in this
   repo) produces the web assets Capacitor will wrap.
3. `npx cap add android` — **one-time**, generates the `android/` Gradle
   project; this step is normally run once locally and the generated
   `android/` directory is committed, not regenerated on every CI run,
   because that's where the signing config and any manual Gradle edits
   live. (Running `cap add android` fresh in CI every time would clobber
   any manual edits to `android/app/build.gradle`.)
4. `npx cap sync android` — copies the fresh `dist/` web build into
   `android/app/src/main/assets/public` and updates native plugins. This is
   the one Capacitor CLI step that *does* run every CI build.
5. From `android/`: `./gradlew assembleRelease` (APK) or `./gradlew
   bundleRelease` (AAB, for Play Store). For a solo-prototype APK handed
   straight to a phone, `assembleRelease` is what's wanted — it's the only
   one of the two that produces an installable `.apk` directly; `bundleRelease`
   produces an `.aab` that Google Play's backend re-signs/splits into device
   APKs and is not directly installable by a user.

### Where the signing config gets wired in

This is standard Android/Gradle, not Capacitor-specific — confirmed against
the **official** Android docs
(https://developer.android.com/studio/publish/app-signing#secure-shared-keystore),
section "Remove signing information from your build files":

In `android/app/build.gradle`, before the `android { }` block:

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
```

Inside `android { }`:

```groovy
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // ...minifyEnabled, proguard, etc.
    }
}
```

`keystore.properties` itself (gitignored, never committed) just holds:

```properties
storeFile=../release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

The CI wiring (confirmed pattern across multiple independent guides —
Ionic's own GitHub Actions tutorial
(https://ionic.io/docs/tutorials/integrations/github-actions/build-android),
ProAndroidDev's "Securely Create Android Release using GitHub Actions"
(https://proandroiddev.com/create-android-release-using-github-actions-c052006f6b0b),
and the general pattern Bitrise/Codemagic also document) is:

1. One-time, locally: `base64 -i release.jks | pbcopy` (or `base64 -w0
   release.jks` on Linux) → paste into a GitHub Actions secret, e.g.
   `ANDROID_KEYSTORE_BASE64`. Store `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` as separate secrets.
2. In the workflow, before the Gradle step:
   ```yaml
   - name: Decode keystore
     run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/release.jks
   - name: Write keystore.properties
     run: |
       cat > android/keystore.properties <<EOF
       storeFile=release.jks
       storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
       keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
       keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
       EOF
   ```
   (Writing a temporary `keystore.properties` from secrets at CI time, rather
   than committing one, keeps the committed `build.gradle` identical to what
   a developer would use locally with their own gitignored file.)
3. `./gradlew assembleRelease` then picks up `signingConfigs.release`
   automatically — no extra signing step (`jarsigner`/`apksigner`) is needed
   when the Gradle signing config above is used; Gradle signs the APK as
   part of the `assembleRelease` task itself. (Some third-party guides found
   during this research — e.g. a Capgo blog post — instead build an
   *unsigned* bundle and run `jarsigner` by hand; that's an alternative, more
   manual path that exists mainly for AAB+Fastlane pipelines. The Gradle
   `signingConfigs` route above is simpler and is what's recommended here.)

---

## 3. Where should the built APK land: workflow artifact vs. GitHub Release?

**Recommendation: attach it to a GitHub Release**, via `gh release upload`
or `softprops/action-gh-release`. Reasoning:

- The stated end goal is "Freeman downloading an installable APK directly to
  his phone from GitHub Releases" — a Release asset is a stable, permanent,
  directly-linkable URL a phone browser can open and that triggers Android's
  normal APK-download-then-install flow. A workflow **artifact**
  (`actions/upload-artifact`) requires a signed-in GitHub session to
  download at all, expires after a retention window (default 90 days,
  often trimmed to far less in guides), and is served as a `.zip` wrapper
  around the file rather than the raw `.apk` — all of which make it
  materially worse for "hand a non-technical phone user a direct download
  link."
- `softprops/action-gh-release` (https://github.com/softprops/action-gh-release)
  is the standard, actively maintained action for this; third-party tracking
  (devops-actions marketplace news, Renovate bump history) suggests a `v3`
  tag exists as of mid-2026 and moved its runtime to Node 24, succeeding the
  long-lived `v2` line — but I could not independently confirm the exact
  current tag against the action's own GitHub Releases page through the
  tools available here, so **confirm the newest `v2.x`/`v3.x` tag at
  workflow-write time** rather than trusting this number. The plain `gh
  release upload <tag> path/to/app-release.apk` CLI call (already available
  in this sandbox/any GitHub-hosted runner, since `gh` is preinstalled on
  GitHub-hosted runners) is an equally valid, dependency-free alternative
  and is arguably simpler for a solo-prototype workflow.
- Since the trigger is manual `workflow_dispatch` (see §5), there's no tag
  push to hang the release off of automatically; the workflow would need to
  either take a version/tag as a `workflow_dispatch` input, or create a
  rolling/dated release (e.g. `gh release create nightly-<date> --title ...`
  or update a single fixed `latest-apk` release tag each run). That's a
  decision for the actual workflow design, not this research ticket, but
  it's worth flagging now: **manual dispatch needs an explicit decision
  about which release tag to attach to.**

---

## 4. Recommended version pins

To stay reproducible and not silently break on "latest" (cross-checked
against the official AGP release notes at
https://developer.android.com/build/releases/gradle-plugin, the official
JDK-requirements page at https://developer.android.com/build/jdks, and
Capacitor 8's official migration/update guide):

| Component | Recommended pin | Why |
|---|---|---|
| Java/JDK | 17 | Required by AGP 8.x (build fails on older JDKs with an explicit "requires Java 17" error); also the GitHub runner image's default JDK, so no extra download needed. Capacitor 8 docs mention JDK 21 as viable too, but 17 is the safer, more universally-compatible pin across AGP 8.x minor versions. |
| Android Gradle Plugin (AGP) | 8.11.x (e.g. `8.11.0`) | Current, well-documented AGP 8 line; pairs with Gradle 8.13 per Android's own compatibility table. Avoid bleeding-edge AGP 9.x / alpha releases for a reproducibility-first prototype. |
| Gradle (wrapper) | 8.13 | Minimum/paired version for AGP 8.11/8.12 per Android's official compatibility table. |
| compileSdk / targetSdk | 35 (or 36 if the Capacitor version in use is Capacitor 8, whose official update guide specifies 36) | Must match what the installed Capacitor major version expects — Capacitor Android does **not** support an arbitrary custom target SDK; it's tied to the Capacitor version, not a free choice. **Action item for whoever builds the real workflow: check `npx cap --version` / the installed `@capacitor/android` major version first and set compileSdk/targetSdk to match that version's documented default**, rather than copying a number from this document verbatim. |
| minSdk | 23–24 | Capacitor 7/8 defaults cluster around here; 24 is Capacitor 8's documented default. |
| Node.js (for the Vite build / Capacitor CLI) | 22.x (matches this repo's existing `engines.node: >=22` in `package.json`) | Keep the CI Node version consistent with what's already pinned for local dev in this repo. |

Pin all of the above as explicit values (`distribution`/`java-version` on
`actions/setup-java`, `android.compileSdk`/`targetSdk` + the AGP version in
`android/build.gradle`, and the Gradle Wrapper's `distributionUrl` in
`gradle-wrapper.properties`) rather than ranges, so "latest" drift in any one
of them can't silently break the build.

---

## 5. Trigger

**Recommendation: `workflow_dispatch` only, for now** — matches the ticket's
explicit instruction that automatic regeneration on every push is a later,
out-of-scope phase. A minimal trigger block:

```yaml
on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: "Release tag to attach the APK to (created if it doesn't exist)"
        required: true
        default: "android-prototype"
```

This keeps the Android build fully opt-in — someone (presumably
Freeman or Ruben) clicks "Run workflow" when they actually want a fresh APK,
rather than every commit to the web app triggering a signing-key-touching
Android build. It also sidesteps the "which tag does the Release attach to"
question raised in §3 by making the tag an explicit input each time.

---

## Illustrative workflow sketch (NOT final, NOT to be used verbatim)

This is only to demonstrate the plan is concrete — every version string,
action tag, and path below should be re-verified against current docs/action
releases by whoever actually writes the real workflow.

```yaml
name: Android APK (manual)

on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: "Release tag to attach the APK to"
        required: true
        default: "android-prototype"

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install JS dependencies
        run: npm ci

      - name: Build web assets (Vite)
        run: npm run build

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      # Explicit SDK setup for reproducibility, even though the ubuntu-latest
      # image already ships an Android SDK — this pins licenses/cmdline-tools
      # version instead of relying on whatever the image happens to have.
      - uses: android-actions/setup-android@v4
        with:
          packages: "platforms;android-35 build-tools;35.0.0"

      - name: Capacitor sync
        run: npx cap sync android

      - name: Decode signing keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/release.jks

      - name: Write keystore.properties
        run: |
          cat > android/keystore.properties <<EOF
          storeFile=release.jks
          storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF

      - name: Build signed release APK
        working-directory: android
        run: ./gradlew assembleRelease --no-daemon

      - name: Attach APK to GitHub Release
        run: |
          gh release create "${{ inputs.release_tag }}" \
            --title "Drafty3D Learn (Android prototype)" \
            --notes "Automated prototype build." \
            android/app/build/outputs/apk/release/app-release.apk \
            --clobber
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

(`gh release create ... --clobber` both creates the release if it doesn't
exist yet and replaces the asset if it does, which keeps a single rolling
"android-prototype" release URL stable across manual re-runs — avoiding the
"which tag" ambiguity from §3/§5 without needing
`softprops/action-gh-release` at all, though that action remains a fine
alternative if more release-metadata control is wanted later.)

---

## Sources consulted

- `actions/runner-images` Ubuntu 24.04 README (preinstalled Android SDK/NDK/Gradle/JDKs): https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
- `android-actions/setup-android` README: https://github.com/android-actions/setup-android
- Android official app-signing docs (`signingConfigs` / `keystore.properties` pattern): https://developer.android.com/studio/publish/app-signing#secure-shared-keystore
- Android Gradle Plugin / Gradle / JDK compatibility: https://developer.android.com/build/jdks and https://developer.android.com/build/releases/gradle-plugin
- Capacitor Android docs (`cap add android`, `cap open android`): https://capacitorjs.com/docs/android
- Capacitor target-SDK coupling: https://capacitorjs.com/docs/android/setting-target-sdk
- Ionic's own GitHub Actions Android build tutorial: https://ionic.io/docs/tutorials/integrations/github-actions/build-android
- ProAndroidDev, "Securely Create Android Release using GitHub Actions": https://proandroiddev.com/create-android-release-using-github-actions-c052006f6b0b
- `softprops/action-gh-release`: https://github.com/softprops/action-gh-release

## Honest gaps / things I could not fully verify

- I could not directly load `android-actions/setup-android`'s or
  `softprops/action-gh-release`'s GitHub *Releases* page through the tools
  available in this session to confirm their exact latest version tags
  (`v4.0.1` and `v3`, respectively, are third-party-reported, not
  first-party-confirmed here). Re-check both before pinning in a real
  workflow.
- I did not trigger an actual GitHub Actions run (out of scope per the
  ticket, and likely not possible from this sandbox anyway) — everything
  above is documentation- and pattern-based, not an observed green CI run.
  The first real run of whatever workflow gets written should be treated as
  the actual confirmation.
- The exact `compileSdk`/`targetSdk` numbers depend on which Capacitor major
  version ends up installed in this repo (not yet added — `package.json` has
  no Capacitor dependency today), so treat the "35/36" figures in §4 as
  provisional pending that choice.
