# Next Steps Action Plan
**Created:** November 23, 2025  
**For:** Week 2 Development Sprint

---

## 🎯 This Week's Goals (Week 2)

Focus on **Foundation Tasks** - three high-impact improvements that will strengthen the application's architecture and UX.

---

## 📅 Daily Breakdown

### Monday-Tuesday: Company Config Site-Wide
**Estimated:** 2-3 days | **Priority:** HIGH

#### Day 1 (Monday)
**Morning:**
1. Update `Footer.tsx`
   - Import `useCompanyConfig` hook
   - Replace hard-coded phone: `(314) 738-0100` → `config.contactInfo.phone.display`
   - Replace hard-coded email: `info@chesterfieldtaxi.com` → `config.contactInfo.email.general`
   - Add fallback values in case config is null
   - Test in browser

2. Update `Contact.tsx`  
   - Import `useCompanyConfig` hook
   - Replace phone (line 41)
   - Replace emails (lines 45-46)
   - Test in browser

**Afternoon:**
3. Update `HelpFAB.tsx`
   - Import `useCompanyConfig` hook
   - Replace phone (line 84-85)
   - Replace email (line 90)
   - Test FAB functionality

4. Global search & replace
   - Search for `+13147380100` - replace all instances
   - Search for `(314) 738-0100` - replace all instances
   - Search for `info@chesterfield` - replace all instances

**End of Day:** All components use `useCompanyConfig` consistently

#### Day 2 (Tuesday)
**Morning:**
1. Code review & testing
   - Open each page and verify contact info displays
   - Change mock config phone number
   - Verify changes reflect across all pages
   - Test with config = null (fallback values work)

2. Documentation
   - Update README with config usage instructions
   - Document how to update company config in Firestore (future)

**Afternoon:**
3. Commit & push
   - Stage changes: `git add .`
   - Commit: `git commit -m "Centralize company config site-wide using useCompanyConfig hook"`
   - Push: `git push origin main`

**Success Criteria:**
- ✅ Zero hard-coded contact info anywhere
- ✅ Config changes reflect site-wide instantly
- ✅ Fallback values work if config fails

---

### Wednesday-Thursday: Auto-Save Booking Progress
**Estimated:** 1-2 days | **Priority:** HIGH

#### Day 3 (Wednesday)
**Morning:**
1. Create `hooks/usePersistedState.ts`
   ```typescript
   export function usePersistedState<T>(
     key: string,
     initialValue: T,
     debounceMs = 500
   ) {
     // Get initial value from localStorage or use default
     const [state, setState] = useState<T>(() => {
       try {
         const saved = localStorage.getItem(key);
         return saved ? JSON.parse(saved) : initialValue;
       } catch {
         return initialValue;
       }
     });
   
     // Auto-save on change (debounced)
     useEffect(() => {
       const timer = setTimeout(() => {
         try {
           localStorage.setItem(key, JSON.stringify(state));
         } catch (e) {
           console.error('Failed to save to localStorage:', e);
         }
       }, debounceMs);
       return () => clearTimeout(timer);
     }, [key, state, debounceMs]);
   
     const clearSaved = () => {
       localStorage.removeItem(key);
     };
   
     return [state, setState, clearSaved] as const;
   }
   ```

2. Create `hooks/usePersistedBookingForm.ts`
   - Wrap `useBookingFormV3`
   - Use `usePersistedState` for main state
   - Return same interface as `useBookingFormV3`
   - Add `clearSaved` to returned object

**Afternoon:**
3. Test persistence hook
   - Write simple test component
   - Verify save/restore works
   - Test with refresh

4. Create UI indicator component
   - Small toast: "Progress saved ✓"
   - Fade in/out animation
   - Position: bottom-left

#### Day 4 (Thursday)
**Morning:**
1. Integrate with `BookingFlowV3`
   - Replace `useBookingFormV3` with `usePersistedBookingForm`
   - Add saved indicator to UI
   - Call `clearSaved()` in `handleBookRide` after success

2. Test thoroughly
   - Fill out form → refresh → verify data restored
   - Submit booking → verify data cleared
   - Corrupted localStorage → verify graceful handling
   - Performance → verify no lag

**Afternoon:**
3. Edge case handling
   - Handle localStorage disabled
   - Handle quota exceeded
   - Handle corrupt JSON

4. Commit & push
   - `git commit -m "Add auto-save for booking form using localStorage persistence"`

**Success Criteria:**
- ✅ Form state persists across refresh
- ✅ State clears after successful booking
- ✅ User sees "saved" indicator
- ✅ No performance impact

---

### Friday: Performance & Polish
**Estimated:** 1 day | **Priority:** MEDIUM

#### Day 5 (Friday)
**Morning:**
1. Fix Google Maps warnings
   - Check Maps API key loading
   - Verify `&libraries=places` only added once
   - Add cleanup to useEffect in `useGooglePlaces`

2. Add loading states to autocomplete
   - Add `isLoading` boolean to component state
   - Show spinner during fetch
   - Disable input while loading

**Afternoon:**
3. Optimize distance calculation
   - Install lodash: `npm install lodash.debounce`
   - Wrap `calculateDistance` with 300ms debounce
   - Use useCallback for memoization

4. Performance profiling
   - Open React DevTools Profiler
   - Record booking flow interaction
   - Identify slow components
   - Add React.memo where needed

5. Testing & validation
   - Run Lighthouse audit
   - Check console for warnings
   - Test autocomplete smoothness
   - Test form performance

**End of Week:**
6. Commit & push
   - `git commit -m "Performance improvements: fix Maps warnings, add loading states, optimize distance calc"`

**Success Criteria:**
- ✅ Zero console warnings
- ✅ Smooth autocomplete UX
- ✅ Lighthouse score > 90

---

## 📊 Week 2 Deliverables

By end of week, we will have:
1. ✅ Centralized company configuration (site-wide)
2. ✅ Auto-save functionality (major UX win)
3. ✅ Polished performance (faster, smoother)

---

## 🚀 Week 3 Preview

Next week's focus:
1. **Legacy Code Cleanup** - Archive V1 and V2 components
2. **Confirmation Page Polish** - Finalize print view
3. **Firebase Integration Prep** - Set up Firebase project

---

## 💡 Tips for Success

### Daily Workflow
1. **Morning:** Pull latest code, review plan
2. **Mid-day:** Commit working progress
3. **End of day:** Push completed work

### Testing Strategy
- Test each change in browser immediately
- Use multiple browsers (Chrome, Firefox, Safari)
- Test on mobile viewport
- Check console for errors/warnings

### Git Hygiene
- Commit after each logical unit of work
- Write clear commit messages
- Push at least daily

---

## 🆘 If You Get Stuck

### Common Issues

**1. useCompanyConfig returns null**
- Check mock data is loading
- Add console.log to debug
- Use fallback values

**2. localStorage not working**
- Check browser privacy settings
- Test in incognito mode
- Handle disabled localStorage gracefully

**3. Performance issues**
- Profile with React DevTools
- Check for unnecessary re-renders
- Ensure debounce is working

### Resources
- React docs: https://react.dev
- TypeScript docs: https://www.typescriptlang.org/docs
- Project README: Check `.gemini/` folder for documentation

---

## ✅ Success Checklist

By end of Week 2, you should be able to:
- [ ] Change company phone number in one place → see it everywhere
- [ ] Refresh booking page → see form data restored
- [ ] Type in location autocomplete → see smooth, fast results
- [ ] Open console → see zero warnings/errors
- [ ] Run Lighthouse audit → score > 90

**Let's build something great! 🚀**
