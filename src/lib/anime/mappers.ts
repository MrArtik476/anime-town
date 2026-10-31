import type { AniListFeaturedMedia } from "@/lib/anilist/queries";
import type {
  AniListMediaCard,
  AniListMediaDetails,
  AniListRelationEdge,
  MediaTitle,
} from "@/lib/anilist/types";
import type { AnimeCard, AnimeDescription, AnimeDetails, AnimeRelation, FeaturedAnime } from "@/types/anime";

import { cleanDescription, formatFuzzyDate } from "./format";

const CYRILLIC = /[а-яё]/i;
/** Буквы украинского и белорусского алфавитов, которых нет в русском: такие синонимы не считаем русскими. */
const NON_RUSSIAN_CYRILLIC = /[іїєґў]/i;

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Русское название AniList не хранит отдельно — ищем его среди синонимов. */
export function findRussianTitle(synonyms: string[] | null | undefined): string | null {
  return clean(synonyms?.find((synonym) => CYRILLIC.test(synonym) && !NON_RUSSIAN_CYRILLIC.test(synonym)));
}

export function pickTitles(title: MediaTitle, synonyms: string[] | null | undefined) {
  const russian = findRussianTitle(synonyms);
  const english = clean(title.english);
  const romaji = clean(title.romaji);
  const native = clean(title.native);

  const main = russian ?? english ?? romaji ?? native ?? "Без названия";
  const alt = [romaji, english, native].find((candidate) => candidate && candidate !== main) ?? null;
  return { main, alt };
}

const validYear = (year: number | null | undefined) =>
  typeof year === "number" && year > 1900 && year < 2200 ? year : null;

const positive = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 ? value : null;

/** Английское описание AniList до локализации; русское подставляет lib/localization. */
export function originalDescription(raw: string | null | undefined): AnimeDescription | null {
  const text = cleanDescription(raw);
  return text ? { language: "en", source: "anilist", text } : null;
}

export function mapMediaToCard(media: AniListMediaCard): AnimeCard {
  const { main, alt } = pickTitles(media.title, media.synonyms);
  return {
    id: media.id,
    malId: positive(media.idMal),
    title: main,
    altTitle: alt,
    coverUrl: clean(media.coverImage?.large) ?? clean(media.coverImage?.extraLarge),
    coverColor: clean(media.coverImage?.color),
    year: validYear(media.seasonYear) ?? validYear(media.startDate?.year),
    format: media.format ?? null,
    status: media.status ?? null,
    season: media.season ?? null,
    episodes: positive(media.episodes),
    score: positive(media.averageScore),
    genres: (media.genres ?? []).filter(Boolean),
  };
}

export function mapFeatured(media: AniListFeaturedMedia): FeaturedAnime {
  return {
    ...mapMediaToCard(media),
    coverUrl: clean(media.coverImage?.extraLarge) ?? clean(media.coverImage?.large),
    bannerUrl: clean(media.bannerImage),
    description: originalDescription(media.description),
  };
}

function mapRelation(edge: AniListRelationEdge): AnimeRelation | null {
  const node = edge.node;
  if (!node || node.isAdult) return null;
  return {
    id: node.id,
    title: pickTitles(node.title, node.synonyms).main,
    relationType: edge.relationType,
    isAnime: node.type === "ANIME",
    format: node.format,
    year: validYear(node.startDate?.year),
    coverUrl: clean(node.coverImage?.large),
    coverColor: clean(node.coverImage?.color),
  };
}

export function mapMediaToDetails(media: AniListMediaDetails): AnimeDetails {
  const card = mapMediaToCard(media);
  const titles = [media.title.english, media.title.romaji, media.title.native].map(clean);
  const synonyms = (media.synonyms ?? [])
    .map(clean)
    .filter((synonym): synonym is string => !!synonym && synonym !== card.title && !titles.includes(synonym));

  return {
    ...card,
    coverUrl: clean(media.coverImage?.extraLarge) ?? card.coverUrl,
    englishTitle: clean(media.title.english),
    romajiTitle: clean(media.title.romaji),
    nativeTitle: clean(media.title.native),
    synonyms,
    description: originalDescription(media.description),
    bannerUrl: clean(media.bannerImage),
    popularity: positive(media.popularity),
    favourites: positive(media.favourites),
    duration: positive(media.duration),
    source: media.source ?? null,
    startDate: formatFuzzyDate(media.startDate),
    endDate: formatFuzzyDate(media.endDate),
    studios: (media.studios?.nodes ?? []).map((studio) => studio.name).filter(Boolean),
    relations: (media.relations?.edges ?? [])
      .map(mapRelation)
      .filter((relation): relation is AnimeRelation => relation !== null),
  };
}
