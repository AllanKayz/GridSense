import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'gridsense_secret_key_2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { id: 'guest-id', username: 'guest', role: 'GUEST' };
    return next();
  }

  try {
    // Check if token is standard JWT or simple JSON token
    if (token.startsWith('eyJ')) {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
    } else {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      req.user = decoded;
    }
    next();
  } catch (err) {
    req.user = { id: 'guest-id', username: 'guest', role: 'GUEST' };
    next();
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
};
