/**
 * デザインシステムのプリミティブ。実装は用途で2ファイルに分けている。
 * - `./ui-server`: 表示だけ（hooks無し）。ここ経由でServer Componentからも直接使える
 * - `./ui-client`: 操作を伴うもの（"use client"）
 * このファイルはimport元を統一するための再エクスポートで、分割元は変えていない。
 */
export * from "@/components/ui/server";
export * from "@/components/ui/client";
