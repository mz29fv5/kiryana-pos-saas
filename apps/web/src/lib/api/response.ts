import { NextResponse } from 'next/server';

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status });
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json<ApiError>(
    {
      success: false,
      error: { code, message, details },
    },
    { status },
  );
}
