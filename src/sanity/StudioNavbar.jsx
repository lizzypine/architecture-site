import { StudioLogo } from "./StudioLogo";

export function StudioNavbar(props) {
  return (
    <div className="urbanum-studio-navbar">
      <div className="urbanum-studio-navbar__brand">
        <StudioLogo />
      </div>
      {props.renderDefault(props)}
    </div>
  );
}
