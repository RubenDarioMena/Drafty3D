import{a as e,c as t,i as n,l as r,n as i,o as a,r as o,s}from"./viewer-Bvrd51jF.js";var c=384,l=i(),u=new URL(`./examples/`,document.baseURI),d=new r({side:2,vertexShader:`
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    }`,fragmentShader:`
    varying vec3 vNormal;
    void main() {
      vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
      gl_FragColor = vec4(vec3(n.x, -n.z, n.y) * 0.5 + 0.5, 1.0);
    }`});async function f(e){let t=document.createElement(`canvas`);t.width=t.height=c;let n=t.getContext(`2d`,{willReadFrequently:!0});return n.drawImage(e,0,0,c,c),n.getImageData(0,0,c,c).data}function p(e,t){let n=(e,t)=>e[t*4+3]>127,r=0,i=0,a=0,o=0,s=0,l=[-2,2,-2*c,2*c];for(let u=0;u<c*c;u+=1){let c=n(e,u),d=n(t,u);if((c||d)&&(r+=1),!(c&&d)||(i+=1,l.some(r=>!n(e,u+r)||!n(t,u+r))))continue;a+=1;let f=Math.max(...[0,1,2].map(n=>Math.abs(e[u*4+n]-t[u*4+n])))/255;o+=f,f>.1&&(s+=1)}return{iou:r?i/r:1,meanDiff:a?o/a:0,badFraction:a?s/a:0,coverage:r/(c*c)}}window.verifyStep=async({timeline:r,mesh:i,camera:m,reference:h})=>{let g=new e({antialias:!0,alpha:!0,preserveDrawingBuffer:!0});g.setPixelRatio(1),g.setSize(c,c,!1),g.setClearColor(0,0);let _=new URL(r.replace(/[^/]+$/,``),u),v=(await o(l,_,[i])).get(i),y=new t;y.add(new a(v,d));let b=new s(30,1,.01,100);n(b,m,1),g.render(y,b);let x=new Image;x.src=h,await x.decode();let S=p(await f(x),await f(g.domElement));return g.dispose(),S},document.documentElement.dataset.ready=`true`;