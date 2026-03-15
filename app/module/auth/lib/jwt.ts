import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
