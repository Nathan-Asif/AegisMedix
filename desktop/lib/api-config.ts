"use client";

import { getAuthHeader } from "./auth-context";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export { getAuthHeader };
