export type AuthNavState = {
  isSignedIn: boolean;
  displayEmail: string | null;
  primaryLabel: "ログイン" | "設定";
  primaryHref: "/login" | "/settings";
};

export function getAuthNavState(email: string | null | undefined): AuthNavState {
  if (!email) {
    return {
      isSignedIn: false,
      displayEmail: null,
      primaryLabel: "ログイン",
      primaryHref: "/login"
    };
  }

  return {
    isSignedIn: true,
    displayEmail: email,
    primaryLabel: "設定",
    primaryHref: "/settings"
  };
}
