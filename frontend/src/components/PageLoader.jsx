import AppLoader from "./AppLoader.jsx";

// Standard in-page loading state. Every page routes its primary "content is loading"
// branch through this so the whole app shows the same bar animation.
export default function PageLoader({ label = "Loading", className = "" }) {
  return (
    <div className={`grid min-h-[80vh] w-full place-items-center ${className}`}>
      <AppLoader label={label} />
    </div>
  );
}
