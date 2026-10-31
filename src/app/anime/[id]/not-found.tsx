import { NotFoundMessage } from "@/components/layout/not-found-message";

export default function AnimeNotFound() {
  return (
    <NotFoundMessage
      title="Аниме не найдено"
      description="Тайтла с таким номером нет в базе AniList или он недоступен на платформе."
    />
  );
}
