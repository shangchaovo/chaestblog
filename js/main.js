import { boot } from "./app.js?v=20260905a";
import { toast } from "./util.js?v=20260905a";

boot().catch((error) => toast(error.message || "页面启动失败"));
