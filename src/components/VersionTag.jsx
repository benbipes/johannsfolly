import { APP_COMMIT, versionLabel } from '../version.js';

/** Which release this phone is on, so players can check they all match. */
export default function VersionTag() {
  return (
    <p className="version-tag" title={`Build ${APP_COMMIT}`}>
      {versionLabel()}
    </p>
  );
}
