export default function AgentLikeCard({
  className = "",
  imageUrl = "",
  avatarImageUrl = "",
  fallback = "AI",
  title,
  description,
  topLeft,
  topRight,
  floatingControls,
  actions,
  children
}) {
  return (
    <article
      className={`agent-card ${imageUrl ? "agent-card-has-image" : ""} ${className}`}
      style={imageUrl ? { "--agent-card-image": `url("${imageUrl}")` } : undefined}
    >
      {avatarImageUrl ? (
        <img className="agent-card-avatar-img" src={avatarImageUrl} alt="" aria-hidden="true" />
      ) : imageUrl ? null : (
        <div className="agent-card-fallback" aria-hidden="true">{fallback}</div>
      )}
      {topLeft}
      {topRight}
      {floatingControls}

      {actions && <div className="agent-actions">{actions}</div>}

      <div className="agent-card-content">
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
      </div>
    </article>
  );
}
