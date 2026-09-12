import { analyzeTmb, type TmbOptions } from './tmb-experiment';
self.onmessage=(event:MessageEvent<TmbOptions>)=>{
  try {self.postMessage({result:analyzeTmb(event.data)});}
  catch(e){self.postMessage({error:e instanceof Error?e.message:'คำนวณไม่สำเร็จ'});}
};
