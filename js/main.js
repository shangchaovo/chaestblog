import { boot } from "./app.js?v=2026101907";
import { toast } from "./util.js?v=2026101907";

boot().catch((error) => toast(error.message || "页面启动失败"));
