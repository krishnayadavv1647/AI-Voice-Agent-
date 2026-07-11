import "./AppLoader.css";

export default function AppLoader({ label = "Loading" }) {
  return (
    <div className="app-loader" role="status" aria-label={label}>
      {Array.from({ length: 8 }).map((_, index) => (
        <span key={index} className={`app-loader-bar app-loader-bar-${index + 1}`} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
