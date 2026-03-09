import { useState, useEffect, useCallback } from 'react'
import { openDB } from 'idb'

const DB_NAME    = 'pdf-reader'
const DB_VERSION = 1
const STORE      = 'documents'
const MAX_DOCS   = 3

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('openedAt', 'openedAt')
      }
    }
  })
}

export function useDocumentCache() {
  const [recentDocs, setRecentDocs] = useState([])

  useEffect(() => {
    loadRecentDocs().then(setRecentDocs).catch(console.warn)
  }, [])

  const saveDocument = useCallback(async (result) => {
    try {
      const db = await getDB()
      const record = {
        id:            result.fileHash,
        title:         result.title,
        pageCount:     result.pageCount,
        wordCount:     result.wordCount,
        content:       result.content,
        scrollPosition: 0,
        openedAt:      Date.now()
      }
      await db.put(STORE, record)

      // Keep only the most recent MAX_DOCS
      const all = await db.getAllFromIndex(STORE, 'openedAt')
      all.sort((a, b) => b.openedAt - a.openedAt)
      for (const old of all.slice(MAX_DOCS)) {
        await db.delete(STORE, old.id)
      }

      setRecentDocs(all.slice(0, MAX_DOCS).map(docMeta))
    } catch (err) {
      console.warn('Failed to save document to cache:', err)
    }
  }, [])

  const getDocument = useCallback(async (id) => {
    try {
      const db = await getDB()
      return await db.get(STORE, id)
    } catch {
      return null
    }
  }, [])

  const saveScrollPosition = useCallback(async (id, position) => {
    try {
      localStorage.setItem(`pdf-scroll-${id}`, String(position))
    } catch {}
  }, [])

  const getScrollPosition = useCallback((id) => {
    try {
      const val = localStorage.getItem(`pdf-scroll-${id}`)
      return val ? parseFloat(val) : 0
    } catch {
      return 0
    }
  }, [])

  return { recentDocs, saveDocument, getDocument, saveScrollPosition, getScrollPosition }
}

async function loadRecentDocs() {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE, 'openedAt')
    all.sort((a, b) => b.openedAt - a.openedAt)
    return all.slice(0, MAX_DOCS).map(docMeta)
  } catch {
    return []
  }
}

/** Strip heavy content array from doc for the "recent docs" list */
function docMeta(doc) {
  return {
    id:        doc.id,
    title:     doc.title,
    pageCount: doc.pageCount,
    wordCount: doc.wordCount,
    openedAt:  doc.openedAt,
    // Keep content for re-opening
    content:   doc.content
  }
}
