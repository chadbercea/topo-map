import { useGame } from '../sim/store';
import { kindLabel } from '../sim/intel';

// The comms strip's one line (ILI-1470): the latest thing said on the radio, who said it first.
export function CommsLine() {
  const last = useGame((s) => s.comms.messages[s.comms.messages.length - 1]);
  return (
    <span className="comms-line" data-testid="comms-line">
      {last ? (
        <>
          <b>{kindLabel(last.from)}</b> {last.text}
        </>
      ) : (
        <span className="dim">Quiet on the net</span>
      )}
    </span>
  );
}
