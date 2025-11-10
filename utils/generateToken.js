import jwt from "jsonwebtoken";

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || "secretkey", {
    expiresIn: "4h",
  });
};

export default generateToken;
  