import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function loginHandler(req, res, pool) {
  const { name, password } = req.body ?? {};

  if (!name || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  try {
    const [results] = await pool.query("SELECT * FROM users WHERE name = ?", [
      name,
    ]);

    if (!results.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
      bannerUrl: user.bannerUrl || null,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
