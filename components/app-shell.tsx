"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Bell,
  CirclePlus,
  CircleUserRound,
  Home,
  ListChecks,
  Search,
  Sparkles,
  X
} from "lucide-react";
import { AddListingView } from "@/components/add-listing-view";
import { AnalysisSheet } from "@/components/analysis-sheet";
import { AskAiView } from "@/components/ask-ai-view";
import { AuthView } from "@/components/auth-view";
import { BottomNav, type TabId } from "@/components/bottom-nav";
import { DesktopFeedView } from "@/components/desktop-feed-view";
import { DescriptionSheet } from "@/components/description-sheet";
import { FeedView } from "@/components/feed-view";
import { InboxView } from "@/components/inbox-view";
import { OfferSheet } from "@/components/offer-sheet";
import { PhotoGallerySheet } from "@/components/photo-gallery-sheet";
import { MyListingsView } from "@/components/my-listings-view";
import { ProfileView } from "@/components/profile-view";
import { SavedView } from "@/components/saved-view";
import { SellerInfoView } from "@/components/seller-info-view";
import type { CarListing } from "@/data/listings";
import { useAuth } from "@/hooks/use-auth";
import { useFeedInterest } from "@/hooks/use-feed-interest";
import { useOffers } from "@/hooks/use-offers";
import { useSavedCars } from "@/hooks/use-saved-cars";
import { useSellerProfile } from "@/hooks/use-seller-profile";
import { useUserListings } from "@/hooks/use-user-listings";
import {
  readAiVoiceMutedPreference,
  readVideoMutedPreference,
  setAiVoiceMutedPreference,
  setVideoMutedPreference,
  unlockAudioSession
} from "@/lib/audio-session";
import { rankFeedListings } from "@/lib/feed-ranking";
import {
  getReplayRankedListings,
  type FeedInterestState
} from "@/lib/feed-interest";
import { dedupeCarListingsByVin } from "@/lib/listing-dedupe";
import { getListingConfidence } from "@/lib/listing-confidence";
import { getDisclosureSearchText } from "@/lib/listing-disclosures";
import {
  getMediaVerificationIssue,
  hasJunkMediaSignal,
  hasMediaMismatch
} from "@/lib/media-verification";
import { getLatestOfferForListing } from "@/lib/offers";

type BackendFeedResponse = {
  listings: CarListing[];
  nextCursor: string | null;
};

type AuthIntent = {
  action: "save" | "offer" | "message";
  listingId: string;
  message: string;
  createdAt: number;
};

const pendingAuthIntentStorageKey = "carindex.pendingAuthIntent";
const pendingAuthIntentMaxAgeMs = 24 * 60 * 60 * 1000;
const feedChromeHiddenStorageKey = "carindex.feedChromeHidden";
const sellerManualReviewLockPrefix = "carindex.sellerManualReviewLock.";

export function AppShell({
  listings,
  initialFeedCursor = null,
  backendFeedAvailable = false
}: {
  listings: CarListing[];
  initialFeedCursor?: string | null;
  backendFeedAvailable?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("feed");
  const isDesktop = useDesktopMode();
  const [feedListings, setFeedListings] = useState(listings);
  const [feedCursor, setFeedCursor] = useState<string | null>(initialFeedCursor);
  const [feedHasMore, setFeedHasMore] = useState(Boolean(initialFeedCursor));
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedChromeHidden, setFeedChromeHidden] = useState(false);
  const [feedEntryReady, setFeedEntryReady] = useState(false);
  const [feedEntryUnlocked, setFeedEntryUnlocked] = useState(false);
  const [sellerManualReviewLocked, setSellerManualReviewLocked] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [pendingAuthIntent, setPendingAuthIntent] = useState<AuthIntent | null>(null);
  const [sharedListingHandled, setSharedListingHandled] = useState(false);
  const [focusListingId, setFocusListingId] = useState<string | null>(null);
  const [analysisListing, setAnalysisListing] = useState<CarListing | null>(null);
  const [offerListing, setOfferListing] = useState<CarListing | null>(null);
  const [descriptionListing, setDescriptionListing] = useState<CarListing | null>(null);
  const [galleryState, setGalleryState] = useState<{
    listing: CarListing;
    initialIndex: number;
  } | null>(null);
  const { user, loading: authLoading, signOut, deleteAccount } = useAuth();
  const userId = user?.id;
  const {
    rankingInterestState,
    markActiveListing,
    trackListingEvent
  } = useFeedInterest(userId);
  const { savedIds, isSaved, toggleSaved } = useSavedCars(userId);
  const {
    offers,
    createOffer,
    acceptOffer,
    declineOffer,
    counterOffer,
    acceptCounterOffer
  } = useOffers(userId);
  const { profile, setProfile } = useSellerProfile(user);
  const {
    listings: userListings,
    addListing: addUserListing,
    updateListing: updateUserListing,
    requestManualReview,
    removeListing: removeUserListing,
    storageWarning
  } = useUserListings(userId);
  const sellerAttentionListings = useMemo(
    () => userListings.filter(isSellerAttentionListing),
    [userListings]
  );
  const sellerNotifications = useMemo(
    () => sellerAttentionListings.map(createSellerNotification),
    [sellerAttentionListings]
  );
  const rejectedSellerListings = useMemo(
    () => userListings.filter(isRejectedMediaListing),
    [userListings]
  );

  useEffect(() => {
    setFeedListings(listings);
    setFeedCursor(initialFeedCursor);
    setFeedHasMore(Boolean(initialFeedCursor));
  }, [initialFeedCursor, listings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setFeedChromeHidden(window.localStorage.getItem(feedChromeHiddenStorageKey) === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setFeedEntryUnlocked(readVideoMutedPreference() && readAiVoiceMutedPreference());
    setFeedEntryReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) {
      setSellerManualReviewLocked(false);
      return;
    }

    const storageKey = `${sellerManualReviewLockPrefix}${userId}`;
    const hasRejectedListing = rejectedSellerListings.length > 0;

    if (hasRejectedListing) {
      window.localStorage.setItem(storageKey, "true");
      setSellerManualReviewLocked(true);
      return;
    }

    setSellerManualReviewLocked(window.localStorage.getItem(storageKey) === "true");
  }, [rejectedSellerListings.length, userId]);

  const updateFeedChromeHidden = useCallback((hidden: boolean) => {
    setFeedChromeHidden(hidden);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(feedChromeHiddenStorageKey, String(hidden));
    }
  }, []);

  const enterFeedWithAudio = useCallback(() => {
    setVideoMutedPreference(false);
    setAiVoiceMutedPreference(false);
    unlockAudioSession();
    setFeedEntryUnlocked(true);
  }, []);

  const baseFeedListings = useMemo(() => {
    const dedupedListings = new Map<string, CarListing>();

    for (const listing of [...userListings, ...feedListings]) {
      if (isHeldFromFeed(listing)) {
        continue;
      }

      if (!dedupedListings.has(listing.id)) {
        dedupedListings.set(listing.id, listing);
      }
    }

    return dedupeCarListingsByVin([...dedupedListings.values()]);
  }, [feedListings, userListings]);
  const combinedListings = useMemo(
    () => rankFeedListings(baseFeedListings, { interestState: rankingInterestState }),
    [baseFeedListings, rankingInterestState]
  );
  const feedIsExhausted = backendFeedAvailable && !feedHasMore;
  const loopedFeedListings = useMemo(
    () =>
      buildEndlessFeedListings(combinedListings, {
        enabled: feedIsExhausted,
        interestState: rankingInterestState
      }),
    [combinedListings, feedIsExhausted, rankingInterestState]
  );
  const desktopFeedBaseListings = desktopSearchQuery.trim() ? combinedListings : loopedFeedListings;
  const listingsById = useMemo(
    () => new Map(combinedListings.map((listing) => [listing.id, listing])),
    [combinedListings]
  );

  const savedListings = useMemo(
    () => combinedListings.filter((listing) => savedIds.includes(listing.id)),
    [combinedListings, savedIds]
  );
  const desktopFeedListings = useMemo(
    () => filterListingsBySearch(desktopFeedBaseListings, desktopSearchQuery),
    [desktopFeedBaseListings, desktopSearchQuery]
  );
  const latestOfferForSheet = useMemo(
    () => (offerListing ? getLatestOfferForListing(offers, offerListing.id) : null),
    [offerListing, offers]
  );
  const showFeedEntry = feedEntryReady && !feedEntryUnlocked && activeTab === "feed";

  useEffect(() => {
    if (typeof window === "undefined" || sharedListingHandled) {
      return;
    }

    const listingId = new URL(window.location.href).searchParams.get("listing");

    if (!listingId) {
      setSharedListingHandled(true);
      return;
    }

    if (!listingsById.has(listingId)) {
      return;
    }

    setFocusListingId(listingId);
    setActiveTab("feed");
    setSharedListingHandled(true);
  }, [listingsById, sharedListingHandled]);

  const switchTab = (tab: TabId) => {
    setAnalysisListing(null);
    setOfferListing(null);
    setDescriptionListing(null);
    setGalleryState(null);
    setAuthMessage(null);
    setNotificationsOpen(false);
    setActiveTab(tab);
  };

  useEffect(() => {
    if (typeof window === "undefined" || pendingAuthIntent) {
      return;
    }

    try {
      const rawIntent = window.localStorage.getItem(pendingAuthIntentStorageKey);
      if (!rawIntent) return;

      const parsedIntent = JSON.parse(rawIntent) as AuthIntent;
      const isFresh = Date.now() - parsedIntent.createdAt < pendingAuthIntentMaxAgeMs;

      if (isFresh && parsedIntent.listingId && parsedIntent.action && parsedIntent.message) {
        setPendingAuthIntent(parsedIntent);
      } else {
        window.localStorage.removeItem(pendingAuthIntentStorageKey);
      }
    } catch {
      window.localStorage.removeItem(pendingAuthIntentStorageKey);
    }
  }, [pendingAuthIntent]);

  useEffect(() => {
    if (!user || !pendingAuthIntent) {
      return;
    }

    const listing = listingsById.get(pendingAuthIntent.listingId);
    setPendingAuthIntent(null);
    setAuthMessage(null);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(pendingAuthIntentStorageKey);
    }

    if (!listing) {
      setActiveTab("feed");
      return;
    }

    setFocusListingId(listing.id);
    setActiveTab("feed");

    if (pendingAuthIntent.action === "save") {
      if (!isSaved(listing.id)) {
        toggleSaved(listing.id);
      }
      return;
    }

    if (pendingAuthIntent.action === "offer") {
      setOfferListing(listing);
      return;
    }

    setAnalysisListing(listing);
  }, [isSaved, listingsById, pendingAuthIntent, toggleSaved, user]);

  const requireAuth = (message: string, intent?: Omit<AuthIntent, "createdAt" | "message">) => {
    if (authLoading) return false;
    if (user) return true;

    if (intent) {
      const nextIntent: AuthIntent = {
        ...intent,
        message,
        createdAt: Date.now()
      };

      setPendingAuthIntent(nextIntent);
      setFocusListingId(intent.listingId);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(pendingAuthIntentStorageKey, JSON.stringify(nextIntent));
      }
    }

    setAnalysisListing(null);
    setOfferListing(null);
    setDescriptionListing(null);
    setGalleryState(null);
    setAuthMessage(message);
    setActiveTab("profile");
    return false;
  };

  const loadMoreFeedListings = useCallback(async () => {
    if (!backendFeedAvailable || !feedHasMore || !feedCursor || feedLoadingMore) {
      return;
    }

    setFeedLoadingMore(true);

    try {
      const response = await fetch(
        `/api/listings/feed?limit=24&cursor=${encodeURIComponent(feedCursor)}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        setFeedHasMore(false);
        return;
      }

      const page = (await response.json()) as BackendFeedResponse;

      setFeedListings((current) => {
        const byId = new Map(current.map((listing) => [listing.id, listing]));

        for (const listing of page.listings) {
          if (!byId.has(listing.id)) {
            byId.set(listing.id, listing);
          }
        }

        return [...byId.values()];
      });
      setFeedCursor(page.nextCursor);
      setFeedHasMore(Boolean(page.nextCursor));
    } catch {
      setFeedHasMore(false);
    } finally {
      setFeedLoadingMore(false);
    }
  }, [backendFeedAvailable, feedCursor, feedHasMore, feedLoadingMore]);

  const renderTabPanel = () => (
    <>
      {activeTab === "search" ? (
        <AskAiView
          listings={combinedListings}
          isSaved={isSaved}
          onOpenAnalysis={setAnalysisListing}
          onToggleSaved={(id) => {
            if (
              requireAuth("Sign in to save this listing. We will bring you back to this car after login.", {
                action: "save",
                listingId: id
              })
            ) {
              toggleSaved(id);
            }
          }}
        />
      ) : null}

      {activeTab === "add" && user ? (
        <AddListingView
          sellerProfile={profile}
          storageWarning={storageWarning}
          requiresManualReview={sellerManualReviewLocked}
          onCreateListing={async (listing, files) => {
            const savedListing = await addUserListing(listing, files);
            setActiveTab("feed");

            if (isHeldFromFeed(savedListing)) {
              setFocusListingId(null);
              setAnalysisListing(savedListing);
              return;
            }

            setFocusListingId(savedListing.id);
          }}
        />
      ) : null}

      {activeTab === "add" && !user ? (
        <AuthView
          compact
          message="Sign in to post a seller video or photo listing to CarIndex.ai."
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}

      {activeTab === "saved" && user ? (
        <SavedView
          listings={savedListings}
          isSaved={isSaved}
          onOpenAnalysis={setAnalysisListing}
          onToggleSaved={toggleSaved}
          onOpenFeed={() => switchTab("feed")}
        />
      ) : null}

      {activeTab === "saved" && !user ? (
        <AuthView
          compact
          message={authMessage ?? "Sign in to keep saved cars tied to your account."}
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}

      {activeTab === "listings" && user ? (
        <MyListingsView
          listings={userListings}
          onBack={() => switchTab("profile")}
          onOpenAnalysis={setAnalysisListing}
          onDeleteListing={removeUserListing}
          onUpdateListing={updateUserListing}
          onRequestManualReview={requestManualReview}
        />
      ) : null}

      {activeTab === "listings" && !user ? (
        <AuthView
          compact
          message="Sign in to manage your listings, review feedback, and listing status."
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}

      {activeTab === "inbox" && user ? (
        <InboxView
          offers={offers}
          onBack={() => switchTab("profile")}
          onAcceptOffer={acceptOffer}
          onDeclineOffer={declineOffer}
          onCounterOffer={counterOffer}
        />
      ) : null}

      {activeTab === "inbox" && !user ? (
        <AuthView
          compact
          message="Sign in to view seller inbox activity and offers."
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}

      {activeTab === "seller-info" && user ? (
        <SellerInfoView
          profile={profile}
          onProfileChange={setProfile}
          onDeleteAccount={async () => {
            const result = await deleteAccount();

            if (!result.error) {
              setActiveTab("feed");
            }

            return result;
          }}
          onBack={() => switchTab("profile")}
        />
      ) : null}

      {activeTab === "seller-info" && !user ? (
        <AuthView
          compact
          message="Sign in to manage seller information."
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}

      {activeTab === "profile" && user ? (
        <ProfileView
          savedCount={savedListings.length}
          listingCount={userListings.length}
          offerCount={offers.length}
          profile={profile}
          authEmail={user.email ?? ""}
          onSignOut={signOut}
          onOpenSellerInfo={() => switchTab("seller-info")}
          onOpenListings={() => switchTab("listings")}
          onOpenInbox={() => switchTab("inbox")}
          onOpenSaved={() => switchTab("saved")}
        />
      ) : null}

      {activeTab === "profile" && !user ? (
        <AuthView
          compact
          message={authMessage ?? "Sign in to manage your seller profile, offers, and listings."}
          onAuthenticated={() => setAuthMessage(null)}
        />
      ) : null}
    </>
  );

  const overlays = (
    <>
      {analysisListing ? (
        <AnalysisSheet
          listing={analysisListing}
          isSaved={isSaved(analysisListing.id)}
          onClose={() => setAnalysisListing(null)}
          onToggleSaved={() => {
            if (
              requireAuth("Sign in to save this listing. We will bring you back to this car after login.", {
                action: "save",
                listingId: analysisListing.id
              })
            ) {
              toggleSaved(analysisListing.id);
            }
          }}
        />
      ) : null}

      {descriptionListing ? (
        <DescriptionSheet
          listing={descriptionListing}
          onClose={() => setDescriptionListing(null)}
        />
      ) : null}

      {offerListing ? (
        <OfferSheet
          listing={offerListing}
          latestOffer={latestOfferForSheet}
          onClose={() => setOfferListing(null)}
          onCreateOffer={createOffer}
          onAcceptCounter={acceptCounterOffer}
        />
      ) : null}

      {galleryState ? (
        <PhotoGallerySheet
          listing={galleryState.listing}
          initialIndex={galleryState.initialIndex}
          onClose={() => setGalleryState(null)}
        />
      ) : null}
    </>
  );
  const feedNotificationAction =
    activeTab === "feed" && user && sellerNotifications.length > 0 && !showFeedEntry && !feedChromeHidden ? (
      <NotificationBellButton
        count={sellerNotifications.length}
        variant={isDesktop ? "desktop" : "mobile"}
        onClick={() => setNotificationsOpen(true)}
      />
    ) : null;

  if (isDesktop) {
    const desktopNavigation = (
        <DesktopNav
          activeTab={activeTab}
          onTabChange={switchTab}
        />
    );
    const cleanFeedChrome = activeTab === "feed" && feedChromeHidden;

    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.13),transparent_28%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.08),transparent_25%),#030405] text-white">
        {cleanFeedChrome ? null : (
          <DesktopHeader
            authEmail={user?.email ?? null}
            searchQuery={desktopSearchQuery}
            onSearchQueryChange={(query) => {
              setDesktopSearchQuery(query);
              if (activeTab !== "feed") {
                switchTab("feed");
              }
            }}
            onSearchFocus={() => {
              if (activeTab !== "feed") {
                switchTab("feed");
              }
            }}
            onOpenProfile={() => switchTab("profile")}
            onSignOut={signOut}
          />
        )}

        <main className={`${cleanFeedChrome ? "h-[100dvh]" : "h-[calc(100dvh-76px)]"} w-full overflow-hidden`}>
          {activeTab === "feed" ? (
            <DesktopFeedView
              navigation={desktopNavigation}
              listings={desktopFeedListings}
              focusListingId={focusListingId}
              onFocusListingHandled={() => setFocusListingId(null)}
              searchQuery={desktopSearchQuery}
              feedChromeHidden={feedChromeHidden}
              onFeedChromeHiddenChange={updateFeedChromeHidden}
              currentUserId={userId}
              isSaved={isSaved}
              onActiveListingChange={markActiveListing}
              onListingInterest={(listing, type, metadata) =>
                trackListingEvent(listing, type, { metadata })
              }
              onOpenAnalysis={setAnalysisListing}
              onOpenOffer={(listing) => {
                if (
                  requireAuth("Sign in to make an offer. We will reopen this listing after login.", {
                    action: "offer",
                    listingId: listing.id
                  })
                ) {
                  setOfferListing(listing);
                }
              }}
              onOpenGallery={(listing, initialIndex) => setGalleryState({ listing, initialIndex })}
              onOpenDescription={setDescriptionListing}
              notificationAction={feedNotificationAction}
              onNearEnd={desktopSearchQuery.trim() ? undefined : loadMoreFeedListings}
              isLoadingMore={desktopSearchQuery.trim() ? false : feedLoadingMore}
              onToggleSaved={(id) => {
                if (
                  requireAuth("Sign in to save this listing. We will bring you back to this car after login.", {
                    action: "save",
                    listingId: id
                  })
                ) {
                  toggleSaved(id);
                }
              }}
            />
          ) : (
            <div className="grid h-full grid-cols-[84px_minmax(0,760px)] justify-center gap-7 overflow-hidden px-6 pb-5 pt-2">
              {desktopNavigation}
              <div className="h-full w-full overflow-hidden rounded-[34px] border border-white/10 bg-black/52 shadow-[0_32px_120px_rgba(0,0,0,0.42)]">
                {renderTabPanel()}
              </div>
            </div>
          )}
        </main>

        {showFeedEntry ? <FeedEntryOverlay onEnter={enterFeedWithAudio} /> : null}

        {notificationsOpen ? (
          <NotificationsSheet
            notifications={sellerNotifications}
            onClose={() => setNotificationsOpen(false)}
            onOpenListings={() => switchTab("listings")}
            onOpenNotification={(notification) => {
              void notification;
              setNotificationsOpen(false);
              switchTab("listings");
            }}
          />
        ) : null}

        {overlays}
      </div>
    );
  }

  return (
    <div className="app-shell-viewport flex h-[100dvh] w-screen items-center justify-center bg-[radial-gradient(circle_at_top,#242832_0%,#07080b_46%,#020203_100%)] text-white">
      <div className="app-phone-shell relative h-[100dvh] w-full max-w-[390px] overflow-hidden bg-black shadow-phone md:my-5 md:h-[min(900px,calc(100dvh-40px))] md:rounded-[34px] md:border md:border-white/12">
        <main className="relative h-full overflow-hidden">
          {activeTab === "feed" ? (
            <FeedView
              listings={loopedFeedListings}
              focusListingId={focusListingId}
              onFocusListingHandled={() => setFocusListingId(null)}
              feedChromeHidden={feedChromeHidden}
              onFeedChromeHiddenChange={updateFeedChromeHidden}
              currentUserId={userId}
              isSaved={isSaved}
              onActiveListingChange={markActiveListing}
              onListingInterest={(listing, type, metadata) =>
                trackListingEvent(listing, type, { metadata })
              }
              onOpenAnalysis={setAnalysisListing}
              onOpenOffer={(listing) => {
                if (
                  requireAuth("Sign in to make an offer. We will reopen this listing after login.", {
                    action: "offer",
                    listingId: listing.id
                  })
                ) {
                  setOfferListing(listing);
                }
              }}
              onOpenGallery={(listing, initialIndex) => setGalleryState({ listing, initialIndex })}
              onOpenDescription={setDescriptionListing}
              notificationAction={feedNotificationAction}
              onNearEnd={loadMoreFeedListings}
              isLoadingMore={feedLoadingMore}
              onToggleSaved={(id) => {
                if (
                  requireAuth("Sign in to save this listing. We will bring you back to this car after login.", {
                    action: "save",
                    listingId: id
                  })
                ) {
                  toggleSaved(id);
                }
              }}
            />
          ) : null}
          {renderTabPanel()}
        </main>

        {activeTab === "feed" && feedChromeHidden ? null : (
          <BottomNav
            activeTab={activeTab}
            onTabChange={switchTab}
          />
        )}

        {showFeedEntry ? <FeedEntryOverlay onEnter={enterFeedWithAudio} /> : null}

        {notificationsOpen ? (
          <NotificationsSheet
            notifications={sellerNotifications}
            onClose={() => setNotificationsOpen(false)}
            onOpenListings={() => switchTab("listings")}
            onOpenNotification={(notification) => {
              void notification;
              setNotificationsOpen(false);
              switchTab("listings");
            }}
          />
        ) : null}

        {overlays}
      </div>
    </div>
  );
}

function DesktopHeader({
  authEmail,
  searchQuery,
  onSearchQueryChange,
  onSearchFocus,
  onOpenProfile,
  onSignOut
}: {
  authEmail: string | null;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchFocus: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="mx-auto flex h-[76px] w-full max-w-[1180px] items-center gap-5 px-6">
      <button
        type="button"
        className="flex shrink-0 items-center gap-3 text-left transition active:scale-[0.99]"
        onClick={onOpenProfile}
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-100/10 text-cyan-100 shadow-[0_16px_42px_rgba(103,232,249,0.1)]">
          <Sparkles className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-lg font-black leading-none text-white">CarIndex.ai</span>
          <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.16em] text-white/36">
            AI-ranked local car feed
          </span>
        </span>
      </button>

      <form
        className="mx-auto hidden w-full max-w-[520px] flex-1 lg:block"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchFocus();
        }}
      >
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search make, model, price, location"
            className="h-11 w-full rounded-full border border-white/8 bg-white/[0.06] pl-11 pr-4 text-sm font-bold text-white outline-none transition placeholder:text-white/34 hover:bg-white/[0.085] focus:border-cyan-100/32 focus:bg-white/[0.1] focus:ring-4 focus:ring-cyan-100/8"
            aria-label="Search listings"
          />
        </label>
      </form>

      {authEmail ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="max-w-[220px] truncate rounded-full bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/72 transition hover:bg-white/[0.1] hover:text-white"
            onClick={onOpenProfile}
          >
            {authEmail}
          </button>
          <button
            type="button"
            className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-cyan-100 active:scale-[0.98]"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/sign-in"
            className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-black text-white/76 transition hover:bg-white/[0.1] hover:text-white"
          >
            Sign in
          </a>
          <a
            href="/sign-up"
            className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-cyan-100 active:scale-[0.98]"
          >
            Sign up
          </a>
        </div>
      )}
    </header>
  );
}

function FeedEntryOverlay({ onEnter }: { onEnter: () => void }) {
  const handleEnter = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onEnter();
  };

  return (
    <div
      className="absolute inset-0 z-[80] grid place-items-center bg-black/72 px-6 text-white backdrop-blur-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-[340px] text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-cyan-100/22 bg-cyan-100/12 text-cyan-100 shadow-[0_18px_60px_rgba(103,232,249,0.16)]">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-3xl font-black leading-none tracking-normal">
          View CarIndex cars
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/62">
          Enter the ranked feed with audio ready. You can mute AI or video anytime.
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black shadow-[0_18px_50px_rgba(255,255,255,0.12)] transition hover:bg-cyan-100 active:scale-[0.98]"
          onClick={handleEnter}
        >
          Enter
        </button>
      </div>
    </div>
  );
}

type SellerNotification = {
  id: string;
  listing: CarListing;
  title: string;
  message: string;
  tone: "rejected" | "review";
};

function NotificationBellButton({
  count,
  variant = "mobile",
  onClick
}: {
  count: number;
  variant?: "mobile" | "desktop";
  onClick: () => void;
}) {
  if (variant === "desktop") {
    return (
      <button
        type="button"
        className="group relative grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/18 active:scale-95"
        onClick={onClick}
        aria-label={`${count} listing notification${count === 1 ? "" : "s"}`}
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border border-black bg-amber-300 px-1 text-[10px] font-black text-black">
          {Math.min(9, count)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="feed-action-button group relative flex w-16 flex-col items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.03em] text-white transition"
      onClick={onClick}
      aria-label={`${count} listing notification${count === 1 ? "" : "s"}`}
    >
      <span className="feed-action-icon relative grid h-12 w-12 place-items-center rounded-full border border-white/18 bg-black/48 text-white shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition group-active:scale-90 group-hover:bg-white/18">
        <Bell className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border border-black bg-amber-300 px-1 text-[10px] font-black text-black">
          {Math.min(9, count)}
        </span>
      </span>
      <span className="max-w-full truncate rounded-full bg-black/30 px-1 py-0.5 text-white/86 backdrop-blur-xl">
        Alerts
      </span>
    </button>
  );
}

function NotificationsSheet({
  notifications,
  onClose,
  onOpenListings,
  onOpenNotification
}: {
  notifications: SellerNotification[];
  onClose: () => void;
  onOpenListings: () => void;
  onOpenNotification: (notification: SellerNotification) => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/66 px-4 py-[calc(env(safe-area-inset-top)+16px)] text-white backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[430px] flex-col rounded-[30px] border border-white/10 bg-[#080a0f] shadow-[0_34px_120px_rgba(0,0,0,0.52)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/80">
              Notifications
            </p>
            <h2 className="mt-1 text-2xl font-black">Listing status</h2>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/72 transition active:scale-95"
            onClick={onClose}
            aria-label="Close notifications"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className="block w-full rounded-[24px] border border-white/10 bg-white/[0.055] p-3.5 text-left transition hover:bg-white/[0.08] active:scale-[0.99]"
                onClick={() => onOpenNotification(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${
                    notification.tone === "rejected"
                      ? "border-amber-200/22 bg-amber-200/12 text-amber-100"
                      : "border-sky-200/22 bg-sky-200/12 text-sky-100"
                  }`}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-white">{notification.title}</p>
                      <span className="rounded-full border border-white/10 bg-black/28 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-white/52">
                        Listings
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-black text-white/72">
                      {notification.listing.year} {notification.listing.make} {notification.listing.model}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs font-bold leading-5 text-white/50">
                      {notification.message}
                    </p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-5">
              <p className="text-sm font-bold leading-6 text-white/62">
                No listing notifications right now.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-white/8 p-4">
          <button
            type="button"
            className="min-h-12 w-full rounded-full bg-white px-5 text-sm font-black text-black transition hover:bg-cyan-100 active:scale-[0.98]"
            onClick={onOpenListings}
          >
            Go to my listings
          </button>
        </div>
      </div>
    </div>
  );
}

function createSellerNotification(listing: CarListing): SellerNotification {
  const rejected = isRejectedMediaListing(listing);
  const manualReviewRequested =
    listing.tags.some((tag) => /manual-review-requested/i.test(tag)) ||
    readModerationStatus(listing) === "manual_review_requested";

  if (rejected) {
    return {
      id: `${listing.id}:rejected`,
      listing,
      tone: "rejected",
      title: manualReviewRequested ? "Manual review requested" : "Listing rejected",
      message: manualReviewRequested
        ? "Your listing is waiting for manual review. It is private until review is resolved."
        : getMediaVerificationIssue(listing)
    };
  }

  return {
    id: `${listing.id}:review`,
    listing,
    tone: "review",
    title: manualReviewRequested ? "Manual review requested" : "Listing held for review",
    message: "This listing is private while manual review confirms it should appear in the feed."
  };
}

function filterListingsBySearch(listings: CarListing[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return listings;
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return listings.filter((listing) => {
    const confidenceRead = getListingConfidence(listing);
    const searchableText = [
      listing.year,
      listing.make,
      listing.model,
      listing.trim,
      listing.price,
      listing.mileage,
      listing.location,
      listing.sellerType,
      listing.sellerName,
      listing.feedBadge,
      listing.aiHook,
      listing.aiTake,
      confidenceRead.label,
      confidenceRead.shortLabel,
      confidenceRead.pricingLabel,
      ...confidenceRead.strengths,
      ...confidenceRead.gaps,
      listing.riskLevel,
      listing.listingTitle,
      listing.listingDescription,
      getDisclosureSearchText(listing),
      ...listing.tags
    ]
      .filter((value): value is string | number => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();

    return terms.every((term) => searchableText.includes(term));
  });
}

function isHeldFromFeed(listing: CarListing) {
  return (
    listing.sourceMode === "user" &&
    (isRejectedMediaListing(listing) || isManualReviewListing(listing))
  );
}

function isSellerAttentionListing(listing: CarListing) {
  return listing.sourceMode === "user" && (isRejectedMediaListing(listing) || isManualReviewListing(listing));
}

function isRejectedMediaListing(listing: CarListing) {
  return hasMediaMismatch(listing) || hasJunkMediaSignal(listing);
}

function isManualReviewListing(listing: CarListing) {
  return (
    listing.tags.some((tag) => /manual-review-required|manual-review-requested/i.test(tag)) ||
    readModerationStatus(listing) === "manual_review_required" ||
    readModerationStatus(listing) === "manual_review_requested"
  );
}

function readModerationStatus(listing: CarListing) {
  const moderation = listing.rawProviderSummary?.moderation;
  if (!moderation || typeof moderation !== "object" || Array.isArray(moderation)) {
    return "";
  }

  const status = (moderation as { status?: unknown }).status;
  return typeof status === "string" ? status : "";
}

function buildEndlessFeedListings(
  listings: CarListing[],
  {
    enabled,
    interestState
  }: {
    enabled: boolean;
    interestState?: FeedInterestState | null;
  }
) {
  if (!enabled || listings.length === 0) {
    return listings;
  }

  const minimumLength = Math.max(96, listings.length * 3);
  const replayListings = getReplayRankedListings(listings, interestState);
  const looped = [...listings];
  let cycle = 0;

  while (looped.length < minimumLength && replayListings.length > 0 && cycle < 6) {
    const cycleListings =
      cycle % 2 === 0
        ? replayListings
        : [...replayListings].sort((left, right) => {
            const leftDistance = Number.isFinite(left.distance) ? left.distance : 10_000;
            const rightDistance = Number.isFinite(right.distance) ? right.distance : 10_000;
            return leftDistance - rightDistance;
          });

    looped.push(...cycleListings);
    cycle += 1;
  }

  return looped;
}

const desktopNavItems: Array<{
  id: TabId;
  label: string;
  icon: ReactNode;
}> = [
  { id: "feed", label: "Feed", icon: <Home className="h-5 w-5" /> },
  { id: "search", label: "Ask AI", icon: <Search className="h-5 w-5" /> },
  { id: "add", label: "Add", icon: <CirclePlus className="h-5 w-5" /> },
  { id: "saved", label: "Saved", icon: <Bookmark className="h-5 w-5" /> },
  { id: "listings", label: "Listings", icon: <ListChecks className="h-5 w-5" /> },
  { id: "profile", label: "Profile", icon: <CircleUserRound className="h-5 w-5" /> }
];

function DesktopNav({
  activeTab,
  onTabChange
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <aside className="flex h-full w-[84px] shrink-0 flex-col items-center rounded-[30px] bg-black/38 px-3 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-100/18 bg-cyan-100/10 text-cyan-100 shadow-[0_16px_42px_rgba(103,232,249,0.12)]">
          <Sparkles className="h-5 w-5" />
      </div>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3">
        {desktopNavItems.map((item) => {
          const active = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`group relative grid h-14 w-14 place-items-center rounded-2xl border transition active:scale-95 ${
                active
                  ? "border-white/22 bg-white text-black shadow-[0_18px_44px_rgba(255,255,255,0.12)]"
                  : "border-white/8 bg-white/[0.035] text-white/76 hover:bg-white/[0.075] hover:text-white"
              }`}
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              title={item.label}
            >
              {item.icon}
            </button>
          );
        })}
      </nav>

      <div className="h-3" />
    </aside>
  );
}

function useDesktopMode() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
