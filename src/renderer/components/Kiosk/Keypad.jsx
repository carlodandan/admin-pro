import React from 'react';
import { Delete } from 'lucide-react';

/**
 * The kiosk number pad.
 *
 * Same three-column layout and the same four callbacks as before; what changed
 * is that the keys were white-on-white cards in an otherwise dark app, and none
 * of them declared `type="button"`, so each one submitted any form it was
 * dropped into. The 64 px rows are kept deliberately: this is the one surface in
 * the app operated by a queue of people with a finger.
 */
const Keypad = ({ onKeyPress, onClear, onEnter, showEnter = true }) => {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'DEL'];

  return (
    <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-3">
      {keys.map((key, index) => {
        if (key === '') return <div key={index} aria-hidden="true" />;

        if (key === 'DEL') {
          return (
            <button
              key={index}
              type="button"
              onClick={onClear}
              className="btn btn-danger-ghost h-16"
              aria-label="Delete the last digit"
            >
              <Delete size={24} aria-hidden="true" />
            </button>
          );
        }

        return (
          <button
            key={index}
            type="button"
            onClick={() => onKeyPress(key)}
            className="btn btn-outline h-16 text-2xl"
          >
            {key}
          </button>
        );
      })}

      {showEnter && (
        <button type="button" onClick={onEnter} className="btn btn-primary col-span-3 mt-1 h-14 text-base">
          Enter
        </button>
      )}
    </div>
  );
};

export default Keypad;
