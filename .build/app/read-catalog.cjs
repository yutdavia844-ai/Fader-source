// Optional transport on computers with Node installed. The host builds the catalog URL.
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{
  try{
    const {url,body}=JSON.parse(input);
    const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body||undefined,signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error();
    const data=await response.text();if(data.length>8*1024*1024)throw Error();
    process.stdout.write(data);
  }catch{process.exitCode=1;}
});
