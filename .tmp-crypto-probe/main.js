const {app,BrowserWindow}=require("electron");
const path=require("path");
app.whenReady().then(()=>{
  const w=new BrowserWindow({
    width:500,height:300,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  w.webContents.on("console-message",(_e,l,m)=>console.log("C",m));
  w.loadFile(path.join(process.env.TEMP,"crypto-probe-sandbox","index.html"));
  setTimeout(()=>app.quit(),2500);
});
