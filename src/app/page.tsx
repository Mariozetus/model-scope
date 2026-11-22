import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
import { SubscriptionCalculator } from "@/components/subscription-calculator";
import { RecommenderWizard } from "@/components/recommender-wizard";
import { Hero } from "@/components/hero";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAllModelsSorted,
  getFeaturedModels,
} from "@/data/models";

export default function HomePage() {
  const featured = getFeaturedModels();
  const all = getAllModelsSorted();

  // Los modelos con suscripción oficial son los que la calculadora puede comparar.
  const comparable = all.filter(
    (m) =>
      m.subscriptions.length > 0 && m.apiChannels.length + m.providerOffers.length > 0,
  );

  return (
    <>
      <Hero stats={{ models: all.length, labs: 7, providers: 3 }} />

      <div className="mx-auto max-w-7xl space-y-20 px-4 pb-20 sm:px-6">
        <Suspense fallback={<CatalogSkeleton />}>
          <Catalog featured={featured} all={all} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <SubscriptionCalculator models={comparable} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <RecommenderWizard models={all} />
        </Suspense>
      </div>
    </>
  );
}

function CatalogSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </section>
  );
}

function SectionSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </section>
  );
}
