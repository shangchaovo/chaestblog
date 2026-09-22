import { boot } from "./app.js?v=20260922b";
import { toast } from "./util.js?v=20260922b";

boot().catch((error) => toast(error.message || "页面启动失败"));
