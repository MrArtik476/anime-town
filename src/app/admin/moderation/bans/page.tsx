import type { Metadata } from "next";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { BAN_FILTER_LABELS, BAN_FILTERS, type BanFilter, pageHref, parseBanFilter } from "@/features/moderation/admin-model";
import { getAllBans } from "@/features/moderation/admin-queries";
import { AdminBanList } from "@/features/moderation/components/admin-ban-list";
import { FilterLinks, ListError, ModerationTabs, MoreLink } from "@/features/moderation/components/admin-ui";

export const metadata: Metadata = {
  title: "Баны — админ-панель",
  robots: { index: false },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE = "/admin/moderation/bans";

const EMPTY: Record<BanFilter, string> = {
  active: "Действующих банов нет.",
  ended: "Истёкших и снятых банов нет.",
  all: "Банов ещё не было.",
};

/** «Действующие» — вид по умолчанию, поэтому в адресе его нет. */
const filterParam = (filter: BanFilter) => (filter === "active" ? null : filter);

async function Bans({ searchParams }: Props) {
  // Сначала проверка роли (читает cookies): часы можно читать только после неё, иначе сборка падает на пререндере.
  await requireAdmin();
  const now = new Date();
  const params = await searchParams;
  const filter = parseBanFilter(params.state);
  const bans = await getAllBans(filter, typeof params.cursor === "string" ? params.cursor : null, now);

  return (
    <>
      <ModerationTabs current="bans" />
      <FilterLinks
        label="Состояние банов"
        options={BAN_FILTERS.map((value) => ({
          href: pageHref(BASE, { state: filterParam(value) }),
          label: BAN_FILTER_LABELS[value],
          current: filter === value,
        }))}
      />

      <section aria-labelledby="bans-heading" className="mt-6">
        <h2 id="bans-heading" className="sr-only">
          Баны
        </h2>
        {bans.failed ? (
          <ListError>Не удалось загрузить баны — обновите страницу</ListError>
        ) : (
          <AdminBanList bans={bans.items} empty={EMPTY[filter]} />
        )}
        {bans.nextCursor && (
          <MoreLink
            href={pageHref(BASE, {
              state: filterParam(filter),
              cursor: bans.nextCursor,
            })}
          />
        )}
      </section>
    </>
  );
}

export default function AdminModerationBansPage({ searchParams }: Props) {
  return (
    <AdminShell section="moderation" title="Модерация" description="Все баны: действующие, истёкшие и снятые. Снятие бана записывается в журнал.">
      <Bans searchParams={searchParams} />
    </AdminShell>
  );
}
