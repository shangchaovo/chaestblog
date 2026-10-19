import { boot } from "./app.js?v=2026101908";
import { toast } from "./util.js?v=2026101908";

boot().catch((error) => toast(error.message || "页面启动失败"));
