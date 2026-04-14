import type { Request, Response, NextFunction } from "express";

export function createBasicAuth(adminUser: string, adminPass: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="git-push-tracker admin"');
      res.status(401).json({ error: "authentication required" });
      return;
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const [user, pass] = decoded.split(":");

    if (user !== adminUser || pass !== adminPass) {
      res.setHeader("WWW-Authenticate", 'Basic realm="git-push-tracker admin"');
      res.status(401).json({ error: "invalid credentials" });
      return;
    }

    next();
  };
}
