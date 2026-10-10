import { Question } from '../types/question';

const DB_NAME = 'ApexMedCuradoriaDB';
const DB_VERSION = 1;
const STORE_QUESTIONS = 'questoes';
const STORE_METADATA = 'metadata';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        db.createObjectStore(STORE_QUESTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves full question list to IndexedDB (handles 10,000+ items easily)
 */
export async function saveQuestionsToDb(questions: Question[]): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_QUESTIONS, STORE_METADATA], 'readwrite');
      const store = tx.objectStore(STORE_QUESTIONS);
      const meta = tx.objectStore(STORE_METADATA);

      // Clear previous and insert new
      store.clear();
      for (const q of questions) {
        store.put(q);
      }
      meta.put(Date.now(), 'last_updated');

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Erro ao salvar no IndexedDB:', e);
  }
}

/**
 * Retrieves all questions from IndexedDB
 */
export async function getQuestionsFromDb(): Promise<Question[] | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUESTIONS, 'readonly');
      const store = tx.objectStore(STORE_QUESTIONS);
      const req = store.getAll();

      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result as Question[]);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Erro ao ler do IndexedDB:', e);
    return null;
  }
}

/**
 * Updates a single question in IndexedDB
 */
export async function updateSingleQuestionInDb(question: Question): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUESTIONS, 'readwrite');
      const store = tx.objectStore(STORE_QUESTIONS);
      store.put(question);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Erro ao atualizar questão no IndexedDB:', e);
  }
}
