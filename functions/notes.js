// /notes 收敛到 /notes/，避免归档页出现两个可索引地址
export function onRequest(context) {
  return Response.redirect(new URL("/notes/", context.request.url).toString(), 301);
}
