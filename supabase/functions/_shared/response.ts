// _shared/response.ts
// Standardized response helpers for Edge Functions

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function successResponse(data: unknown) {
  return jsonResponse({ data }, 200);
}

export function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
