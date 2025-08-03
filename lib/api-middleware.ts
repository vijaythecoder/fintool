/**
 * Common middleware utilities for Cash Clearing API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/src/utils/logger.js';
import { rateLimit } from './rate-limit';

// User interface
export interface User {
  id: string;
  type: 'user' | 'api';
  permissions: string[];
  email?: string;
  roles?: string[];
}

// Authentication result
export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// API response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId: string;
}

// Rate limit configuration
export interface RateLimitOptions {
  limit: number;
  window: string;
  identifier?: (request: NextRequest) => string;
}

/**
 * Authentication middleware
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');

    // API Key authentication
    if (apiKey) {
      const user = await validateApiKey(apiKey);
      if (user) {
        return { success: true, user };
      }
    }

    // JWT Bearer token authentication
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await validateJWT(token);
      if (user) {
        return { success: true, user };
      }
    }

    return { 
      success: false, 
      error: 'Authentication required. Provide valid API key or Bearer token.' 
    };
    
  } catch (error) {
    logger.error('Authentication error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return { 
      success: false, 
      error: 'Authentication failed due to server error' 
    };
  }
}

/**
 * Validate API key
 */
async function validateApiKey(apiKey: string): Promise<User | null> {
  try {
    // In production, this would validate against a database or external service
    const validApiKeys = {
      [process.env.CASH_CLEARING_API_KEY || '']: {
        id: 'api-service',
        type: 'api' as const,
        permissions: [
          'workflow:manage',
          'transaction:read',
          'transaction:process',
          'approval:read',
          'approval:manage',
          'metrics:read',
          'audit:read'
        ]
      },
      [process.env.CASH_CLEARING_READONLY_API_KEY || '']: {
        id: 'api-readonly',
        type: 'api' as const,
        permissions: [
          'transaction:read',
          'approval:read',
          'metrics:read',
          'audit:read'
        ]
      }
    };

    return validApiKeys[apiKey] || null;
  } catch (error) {
    logger.error('API key validation error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
}

/**
 * Validate JWT token
 */
async function validateJWT(token: string): Promise<User | null> {
  try {
    // In production, this would verify JWT signature and extract user claims
    // For now, this is a placeholder implementation
    
    // You would typically use a library like jsonwebtoken:
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Mock implementation for demonstration
    if (token.startsWith('valid-token-')) {
      return {
        id: 'user-from-jwt',
        type: 'user',
        permissions: [
          'workflow:manage',
          'transaction:read',
          'approval:read',
          'approval:manage',
          'metrics:read'
        ],
        email: 'user@example.com',
        roles: ['cash-clearing-operator']
      };
    }

    return null;
  } catch (error) {
    logger.error('JWT validation error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
}

/**
 * Authorization middleware
 */
export function hasPermission(user: User, requiredPermission: string): boolean {
  return user.permissions.includes(requiredPermission) || user.type === 'api';
}

export function hasAnyPermission(user: User, requiredPermissions: string[]): boolean {
  return requiredPermissions.some(permission => hasPermission(user, permission));
}

export function hasAllPermissions(user: User, requiredPermissions: string[]): boolean {
  return requiredPermissions.every(permission => hasPermission(user, permission));
}

/**
 * Rate limiting middleware
 */
export async function applyRateLimit(
  request: NextRequest,
  operation: string,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const identifier = options.identifier 
    ? options.identifier(request)
    : getDefaultIdentifier(request);

  const result = await rateLimit.check(identifier, operation, {
    limit: options.limit,
    window: options.window
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${result.limit} per ${options.window}`,
        retryAfter: result.retryAfter,
        reset: result.reset
      },
      {
        status: 429,
        headers: {
          'Retry-After': result.retryAfter?.toString() || '3600',
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.reset.toISOString()
        }
      }
    );
  }

  return null; // No rate limit response needed
}

/**
 * Default client identifier for rate limiting
 */
function getDefaultIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent')?.substring(0, 50) || 'unknown';
  return `${ip}:${userAgent}`;
}

/**
 * Error handling middleware
 */
export function handleApiError(error: unknown, requestId: string): NextResponse {
  logger.error('API error', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    requestId
  });

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      createErrorResponse(
        'Validation failed',
        'Invalid request parameters',
        requestId,
        { validationErrors: error.errors }
      ),
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('not found')) {
      return NextResponse.json(
        createErrorResponse('Not found', error.message, requestId),
        { status: 404 }
      );
    }

    if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
      return NextResponse.json(
        createErrorResponse('Forbidden', error.message, requestId),
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    createErrorResponse(
      'Internal server error',
      'An unexpected error occurred',
      requestId
    ),
    { status: 500 }
  );
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  requestId?: string
): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    requestId: requestId || generateRequestId()
  };
}

/**
 * Error response helper
 */
export function createErrorResponse(
  error: string,
  message?: string,
  requestId?: string,
  details?: any
): ApiResponse {
  return {
    success: false,
    error,
    message,
    timestamp: new Date().toISOString(),
    requestId: requestId || generateRequestId(),
    ...details
  };
}

/**
 * Request validation middleware
 */
export async function validateRequest<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: NextResponse.json(
          createErrorResponse(
            'Validation failed',
            'Invalid request body',
            generateRequestId(),
            { validationErrors: error.errors }
          ),
          { status: 400 }
        )
      };
    }

    return {
      error: NextResponse.json(
        createErrorResponse(
          'Invalid request',
          'Failed to parse request body',
          generateRequestId()
        ),
        { status: 400 }
      )
    };
  }
}

/**
 * Query parameters validation middleware
 */
export function validateQuery<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): { data: T; error?: never } | { data?: never; error: NextResponse } {
  try {
    const { searchParams } = new URL(request.url);
    const queryParams: Record<string, string | string[]> = Object.fromEntries(searchParams.entries());
    
    // Handle array parameters (comma-separated values)
    Object.keys(queryParams).forEach(key => {
      const value = queryParams[key];
      if (typeof value === 'string' && value.includes(',')) {
        queryParams[key] = value.split(',');
      }
    });

    const data = schema.parse(queryParams);
    return { data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: NextResponse.json(
          createErrorResponse(
            'Validation failed',
            'Invalid query parameters',
            generateRequestId(),
            { validationErrors: error.errors }
          ),
          { status: 400 }
        )
      };
    }

    return {
      error: NextResponse.json(
        createErrorResponse(
          'Invalid request',
          'Failed to parse query parameters',
          generateRequestId()
        ),
        { status: 400 }
      )
    };
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * CORS middleware
 */
export function setCorsHeaders(response: NextResponse, origin?: string): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

/**
 * Request logging middleware
 */
export function logRequest(request: NextRequest, requestId: string, startTime: number) {
  const duration = Date.now() - startTime;
  const method = request.method;
  const url = request.url;
  const userAgent = request.headers.get('user-agent');
  const ip = getClientIP(request);

  logger.info('API request', {
    requestId,
    method,
    url,
    duration,
    userAgent,
    ip
  });
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Comprehensive API middleware wrapper
 */
export interface ApiMiddlewareOptions {
  auth?: boolean;
  permissions?: string[];
  rateLimit?: RateLimitOptions;
  cors?: boolean;
  logging?: boolean;
}

export function withApiMiddleware(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>,
  options: ApiMiddlewareOptions = {}
) {
  return async (request: NextRequest, context: any): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      // CORS preflight handling
      if (request.method === 'OPTIONS') {
        let response = new NextResponse(null, { status: 200 });
        if (options.cors) {
          response = setCorsHeaders(response);
        }
        return response;
      }

      // Rate limiting
      if (options.rateLimit) {
        const rateLimitResponse = await applyRateLimit(
          request,
          context.operation || 'api-call',
          options.rateLimit
        );
        if (rateLimitResponse) {
          return rateLimitResponse;
        }
      }

      // Authentication
      let user: User | undefined;
      if (options.auth) {
        const authResult = await authenticateRequest(request);
        if (!authResult.success) {
          return NextResponse.json(
            createErrorResponse('Unauthorized', authResult.error, requestId),
            { status: 401 }
          );
        }
        user = authResult.user;

        // Authorization
        if (options.permissions && user) {
          const hasRequiredPermissions = hasAnyPermission(user, options.permissions);
          if (!hasRequiredPermissions) {
            return NextResponse.json(
              createErrorResponse(
                'Forbidden',
                'Insufficient permissions for this operation',
                requestId
              ),
              { status: 403 }
            );
          }
        }
      }

      // Add user to context
      const enhancedContext = { ...context, user, requestId };

      // Execute handler
      let response = await handler(request, enhancedContext);

      // Add CORS headers
      if (options.cors) {
        response = setCorsHeaders(response);
      }

      // Add common headers
      response.headers.set('X-Request-ID', requestId);
      response.headers.set('X-Processing-Time', `${Date.now() - startTime}ms`);

      // Request logging
      if (options.logging) {
        logRequest(request, requestId, startTime);
      }

      return response;

    } catch (error) {
      return handleApiError(error, requestId);
    }
  };
}

/**
 * Utility function to safely get user ID from authentication result
 * @param authResult The authentication result
 * @returns The user ID or 'system' if not available
 * @throws Error if authentication failed
 */
export function getUserId(authResult: AuthResult): string {
  if (!authResult.success) {
    throw new Error('Authentication failed');
  }
  
  if (!authResult.user?.id) {
    // Log warning for missing user ID
    logger.warn('User ID missing from authenticated request', {
      userType: authResult.user?.type,
      hasUser: !!authResult.user
    });
    return 'system';
  }
  
  return authResult.user.id;
}

/**
 * Get user ID with custom fallback
 * @param authResult The authentication result
 * @param fallback Custom fallback value (default: 'system')
 * @returns The user ID or fallback value
 */
export function getUserIdOrFallback(authResult: AuthResult, fallback: string = 'system'): string {
  return authResult.user?.id || fallback;
}