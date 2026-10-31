import { boot } from "./app.js?v=2026103101";
import { toast } from "./util.js?v=2026103101";

boot().catch((error) => toast(error.message || "页面启动失败"));
