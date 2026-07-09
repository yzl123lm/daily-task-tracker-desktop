(function(){
  const lines=[];
  try{lines.push("typeof crypto="+typeof crypto)}catch(e){lines.push("typeof threw "+e.message)}
  try{lines.push("uuid="+crypto.randomUUID())}catch(e){lines.push("uuidERR "+e.message)}
  try{lines.push("app.js style id="+ (undefined || crypto.randomUUID()))}catch(e){lines.push("appERR "+e.name+":"+e.message)}
  document.getElementById("o").textContent=lines.join("\n");
  console.log(lines.join(" | "));
})();
