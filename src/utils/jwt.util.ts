import * as jwt from "jsonwebtoken";

const getJwtSecret = (): string => {
  return process.env.SIGNING_SECRET || process.env.JWT_SECRET || "";
};

export const signJwt = <T extends object>(
  payload: T,
  expiresIn: string | number = 60 * 60,
): Promise<string> => {
  const JWT_SECRET = getJwtSecret();
  if (!JWT_SECRET) {
    return Promise.reject(
      new Error(
        "SIGNING_SECRET or JWT_SECRET environment variable must be set",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn,
      } as jwt.SignOptions,
      (error, token) => {
        if (error) {
          reject(error);
        }
        resolve(token || "");
      },
    );
  });
};

export const verifyJwt = <T>(token: string): Promise<T> => {
  const JWT_SECRET = getJwtSecret();
  if (!JWT_SECRET) {
    return Promise.reject(
      new Error(
        "SIGNING_SECRET or JWT_SECRET environment variable must be set",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (error, decoded) => {
      if (error) {
        reject(error);
      }
      resolve(decoded as T);
    });
  });
};
