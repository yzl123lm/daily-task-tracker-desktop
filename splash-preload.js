const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splashAPI", {
  getBootstrap: () => ipcRenderer.invoke("startup-bootstrap"),
  onProgress: (handler) => {
    if (typeof handler !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("startup-progress", listener);
    return () => ipcRenderer.removeListener("startup-progress", listener);
  },
});
