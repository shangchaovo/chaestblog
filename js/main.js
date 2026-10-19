import { boot } from "./app.js?v=2026102001";
import { toast } from "./util.js?v=2026102001";

boot().catch((error) => toast(error.message || "页面启动失败"));
