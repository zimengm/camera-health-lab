importScripts('decoder.js?v=4');
let decoders=[];
onmessage=({data})=>{
 try{
  if(data.type==='reset'){
   const symbols=data.config.symbol==='auto'?(data.config.profile==='rate-coupled'?BFSK.REFINEMENT_SYMBOLS:[.5,.4,.25]):[data.config.symbol];
   decoders=symbols.map(symbol=>new BFSK.LiveDecoder({...data.config,symbol}));postMessage({type:'ready'});
  }
  if(data.type==='samples'){
   for(const decoder of decoders){
    for(const [t,y] of data.samples)decoder.push(t,y);
    for(const event of decoder.process())postMessage({...event,decoder_symbol_seconds:decoder.T});
   }
  }
 }catch(error){postMessage({type:'error',message:error.message});}
};
