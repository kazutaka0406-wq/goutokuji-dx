// admin.html の手前に設置するBasic認証。管理者パスワード（アプリ内の二段階認証）とは
// 別レイヤーの資格情報で、IPアドレス制限が使えない静的ホスティング環境での
// 「管理画面へのアクセス制限」措置として機能する。
export default async (request, context) => {
  const user = Netlify.env.get("ADMIN_BASIC_AUTH_USER");
  const pass = Netlify.env.get("ADMIN_BASIC_AUTH_PASS");

  if (!user || !pass) {
    return context.next();
  }

  const authHeader = request.headers.get("authorization") || "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sepIdx = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, sepIdx);
      const suppliedPass = decoded.slice(sepIdx + 1);
      if (suppliedUser === user && suppliedPass === pass) {
        return context.next();
      }
    } catch (e) {
      // フォールスルーして401を返す
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Goutokuji DX Admin"' },
  });
};

export const config = { path: "/admin.html" };
