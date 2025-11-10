import jwt from "jsonwebtoken";

const protect = (req, res, next) => {
  let token = req.headers.authorization;
    // console.log("Received token:", token); 

  if (token && token.startsWith("Bearer")) {
    try {
      token = token.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
      req.user = {
        id: decoded.id.id,
        role: decoded.id.role,
        email: decoded.id.email
      };
      //  console.log("Decoded req.user:", req.user);
      next();
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  } else {
    return res.status(401).json({ message: "No token, authorization denied" });
  }
};

export default protect;
