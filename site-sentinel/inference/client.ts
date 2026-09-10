import {Analysis} from '../types';
const ROOT='/tasklet/threads/a_7jrbmn7gk6y0487g5x7y/work';
export async function analyzeImage(image:string):Promise<Analysis>{
 const request=ROOT+'/construct-gaurd-inference/'+crypto.randomUUID()+'.json';
 await window.tasklet.writeFileToDisk(request,JSON.stringify({image,threshold:0.35}));
 const output=await window.tasklet.runCommand(`uv run --with onnxruntime==1.29.0 --with pillow==12.3.0 --with numpy==2.5.3 python '${ROOT}/apps/site-sentinel/inference/detect.py' '${request}'`,120);
 if(output.exitCode!==0){console.error('YOLO inference failed',output.log);throw Error('YOLO could not analyze the image. Please retry; no findings or score have been fabricated.');}
 const line=output.log.split('\n').reverse().find(s=>s.trim().startsWith('{'));
 let result:Analysis;try{result=JSON.parse(line||'');}catch(err){console.error('Invalid inference response',output.log);throw Error('The detector returned an unreadable result. Please retry.');}
 if(!Array.isArray(result.detections)||!Number.isInteger(result.missingHelmets)||!Number.isInteger(result.missingVests)||!Number.isFinite(result.width)||!Number.isFinite(result.height)||!Array.isArray(result.warnings)||result.threshold!==0.35){console.error('Unexpected inference schema',result);throw Error('The detector response is incomplete. Please retry.');}
 return result;
}
