import type { Request, Response, NextFunction } from "express";

export function createBasicAuth(adminUser: string, adminPass: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      // No WWW-Authenticate header — avoids browser popup, login is handled by frontend
      res.status(401).json({ error: "authentication required" });
      return;
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const [user, pass] = decoded.split(":");

    if (user !== adminUser || pass !== adminPass) {
      // No WWW-Authenticate header — avoids browser popup, login is handled by frontend
      res.status(401).json({ error: "invalid credentials" });
      return;
    }

    next();
  };
}
