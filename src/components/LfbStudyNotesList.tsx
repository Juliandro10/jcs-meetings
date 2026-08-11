import type { DocumentNote } from '@/lib/note-dom';
import { isLfbStudyFieldId } from '@/lib/lfb-study-fields';
import {
  isWcgConductorNoteId,
  isWcgQuestionNoteId,
  isWcgStudyPrepNote,
  sortWcgStudyNotes,
} from '@/lib/wcg-study-notes';

type LfbStudyNotesListProps = {
  notes: DocumentNote[];
  activeNoteId?: string | null;
  onSelect: (noteId: string) => void;
};

function isLfbSabeNote(note: DocumentNote) {
  return note.id.startsWith('sabe-') || note.tags.includes('lfb-sabe');
}

function NoteCards({
  items,
  activeNoteId,
  onSelect,
}: {
  items: DocumentNote[];
  activeNoteId?: string | null;
  onSelect: (noteId: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((note) => {
        const preview = note.body.trim().replace(/\s+/g, ' ').slice(0, 120);
        const active = note.id === activeNoteId;
        return (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              className={[
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-jw-purple bg-jw-purple-light'
                  : 'border-jw-border bg-white hover:border-jw-purple hover:bg-jw-purple-light/40',
              ].join(' ')}
            >
              <p className="text-xs font-semibold leading-snug text-jw-text">{note.title}</p>
              {preview ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-jw-muted">
                  {preview}
                  {note.body.length > 120 ? '…' : ''}
                </p>
              ) : (
                <p className="mt-1 text-xs italic text-jw-muted">Sem resposta ainda</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function LfbStudyNotesList({ notes, activeNoteId, onSelect }: LfbStudyNotesListProps) {
  const sabeNotes = notes.filter(isLfbSabeNote);
  const studyNotes = notes.filter((note) => isLfbStudyFieldId(note.id));
  const wcgConductor = notes.find((note) => isWcgConductorNoteId(note.id));
  const wcgQuestions = notes.filter((note) => isWcgQuestionNoteId(note.id));

  if (sabeNotes.length === 0 && studyNotes.length === 0 && !wcgConductor && wcgQuestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-4">
      {wcgConductor ? (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-jw-muted">
            Condução do estudo
          </h4>
          <NoteCards items={[wcgConductor]} activeNoteId={activeNoteId} onSelect={onSelect} />
        </section>
      ) : null}

      {wcgQuestions.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-jw-muted">
            Respostas do capítulo
          </h4>
          <NoteCards items={sortWcgStudyNotes(wcgQuestions)} activeNoteId={activeNoteId} onSelect={onSelect} />
        </section>
      ) : null}

      {sabeNotes.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-jw-muted">
            Sabe responder?
          </h4>
          <NoteCards items={sabeNotes} activeNoteId={activeNoteId} onSelect={onSelect} />
        </section>
      ) : null}

      {studyNotes.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-jw-muted">
            Estudo de congregação
          </h4>
          <NoteCards items={studyNotes} activeNoteId={activeNoteId} onSelect={onSelect} />
        </section>
      ) : null}
    </div>
  );
}

export function sortLfbStudyNotes(notes: DocumentNote[]): DocumentNote[] {
  const wcg = notes.filter(isWcgStudyPrepNote);
  if (wcg.length > 0) {
    const rest = notes.filter((note) => !isWcgStudyPrepNote(note));
    return [...sortWcgStudyNotes(wcg), ...sortLfbOnlyNotes(rest)];
  }
  return sortLfbOnlyNotes(notes);
}

function sortLfbOnlyNotes(notes: DocumentNote[]): DocumentNote[] {
  const studyOrder = ['study-q1', 'study-q2', 'study-q3'];

  return [...notes].sort((a, b) => {
    const aSabe = isLfbSabeNote(a);
    const bSabe = isLfbSabeNote(b);
    if (aSabe !== bSabe) return aSabe ? -1 : 1;

    if (aSabe && bSabe) {
      const aMatch = a.id.match(/^sabe-(\d+)-(\d+)$/);
      const bMatch = b.id.match(/^sabe-(\d+)-(\d+)$/);
      if (aMatch && bMatch) {
        const blockCmp = Number(aMatch[1]) - Number(bMatch[1]);
        if (blockCmp !== 0) return blockCmp;
        return Number(aMatch[2]) - Number(bMatch[2]);
      }
    }

    const ai = studyOrder.indexOf(a.id);
    const bi = studyOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}
