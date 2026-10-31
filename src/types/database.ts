// Временная заглушка. После создания Supabase-проекта файл перезаписывается
// командой `npm run db:types` (см. DEVELOPMENT.md).
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
