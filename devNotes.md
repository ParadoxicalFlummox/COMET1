8-12-26
sheetdb will act act the single adapter and gateway for ui, and business logic that handles writes and reads to the spreadsheet instead of spreading database read functions across multiple files.

the best way to think of `SheetDB.js` is a database drive or ORM (object relational mapper)

I am opting to move away from monolithic code so I am going to move configuration that each file needs to sit within the file instead of in a global config file, that way there are no merge conflicts in  the future.

8-13-26
in the `primary_identifier` field in the employees data, parsing the json payload for the first and last name would give a searchable name element that way a search can be done by employee id or a last first combo.

one of the quirks of google apps script is everything shares a single global namespace. If a IIFE (immediately invoked function expression) is used it creates a private helper so that SheetDB is the only file that has access to the helper functions within the file instead of main or some other piece of the code being able to activate functions from within this specific file. keeps the scope per file narrow and limits how things are executed preventing clutter.

on the get active spreadsheet, keeping this a single file instead of multiple apps scripts like in comet0 (what I am calling the never made it to v1 original project) I can keep the project scope narrow making this a plug and play version rather than having to run a security audit every time you make a copy of the file and or having that banner pop up saying that the project is not a verified something made by a user etc.

I know that data retention is important to a multi-billion dollar company, and for legal compliance you cant just delete old records, the goal is to have the project automatically run a trigger that pushes data older than 3 years to a new tab that way none of the functions that would live on the main tables slows down the processing. An active rolling window at I would guess around 2-3 years that way the data is never gone it just lives outside of project memory. eventually the spreadsheet size would get huge so ideally being able to move the individual sheets to a new "archive" sheet would make sense but that can be done in the future.'

much like v0 I am going to use batch reads and writes since GAS is slow and it often will run out of time in its execution cycle the 6 minute limit if I do per cell reads and per cell writes. I learned that the hard way when v0 took almost 5 minutes to generate a schedule. Oh and I also made sure to at least try to prevent race conditions by using the object lock and to keep the entire thing from locking, try blocks of course that way oh no a manager entered `%@)#(*@)*` into some field and crashed the program, the lock is still unlocked for any other manager that may want to actually write in the spreadsheet today, that begs the question what about fresh data, to my understanding that is what `flush()` is for, it tells the google server hey force update the data before releasing the lock that way the next person has the most up to date data.

8-16-26
the database function is complete and the Claude built file to run testcases against what I built has seemingly passed all tests after a couple of typo based bug fixes.