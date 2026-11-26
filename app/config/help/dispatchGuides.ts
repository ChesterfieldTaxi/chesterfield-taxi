import type { HelpGuide } from './types';

export const DISPATCH_GUIDES: HelpGuide[] = [
  {
    id: 'dispatch-workspace-popout',
    portal: 'dispatch',
    title: '3-Pane Workspace & Popout',
    summary:
      'Navigate the tactical 3-pane Dispatch Console (Booking Sidebar, Live Map, Trip Queue), switch right-hand operations docks, and detach multi-monitor popout windows.',
    category: 'Workspace',
    tags: [
      'workspace',
      '3-pane',
      'popout',
      'multi-monitor',
      'compact hud',
      'split dock',
      'wake lock',
      'push alerts',
      'mobile',
      'layout',
    ],
    contextKeys: ['dispatch', 'dispatch:main', 'dispatch:none', 'dispatch:booking'],
    steps: [
      {
        title: 'Switch desktop docks from the top bar',
        description:
          'Use the top-left switcher (Main, Phone, Email, Drivers) to keep the full 3-pane console visible (Main) or open a side-by-side operations dock on the right.',
      },
      {
        title: 'Choose Compact HUD, Split Dock, or Pop-Out layout',
        description:
          'Click the top-left menu icon (☰) to open the Operations Drawer and select Compact HUD (maximal queue space), Split Dock (side-by-side dialer/roster), or Pop-Out ↗ (detached multi-monitor windows).',
        tip: 'You can also pop out Phone Hub, Email Console, or Drivers Roster individually using the ↗ button next to each module in the Operations Drawer.',
      },
      {
        title: 'Configure Appearance, Keep Screen Awake & Push Alerts',
        description:
          'Click the gear icon (Dispatch Settings) in the top-right header to set Light/Dark/System appearance, enable Keep Screen Awake on shift, and enable Browser Push Alerts for background ASAP/Unconfirmed rides.',
      },
      {
        title: 'Use the 5-tab bottom dock on mobile/tablet',
        description:
          'On smaller viewports, switch between Trips, Booking, Comms, Email, and Fleet from the bottom bar, and configure Hold → Actions vs Hold → Select under Trip Card Gesture in the Operations Drawer.',
      },
    ],
    reference: [
      {
        title: 'Workspace Modes & Header Controls',
        rows: [
          {
            label: 'Main (Compact HUD)',
            description: 'Left Booking Engine + top/center Live Map + Trip Queue with floating caller HUD.',
            badge: 'Default',
            badgeVariant: 'info',
          },
          {
            label: 'Split Dock',
            description: 'Pins Phone Hub, Email Console, Drivers Roster, or Alerts alongside the main workspace.',
          },
          {
            label: 'Pop-Out ↗',
            description: 'Detaches Comms, Email, or Drivers into separate browser windows synchronized in real time.',
            badge: 'Multi-Monitor',
            badgeVariant: 'primary',
          },
          {
            label: 'Sound Notification Toggle',
            description: 'Speaker/bell icon in the top bar that mutes or unmutes inbound call rings and ASAP chimes.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do detached Pop-Out windows stay in sync when I click "Populate Booking"?',
        answer:
          'Yes. Detached Comms, Email, and Drivers windows communicate over the cross-window WorkspaceBus so populating a booking or opening a trip updates your active draft immediately.',
      },
      {
        question: 'Why does Browser Push Alerts show "Blocked"?',
        answer:
          'Notification permission was denied in browser site settings. Allow notifications for this site in your browser address bar lock/tune menu, then reload Dispatch.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/workspace-popout.png',
        alt: '3-pane Dispatch Console showing Booking sidebar, Live Map, Trip Queue, and Dock switcher',
        caption: '3-pane Dispatch Console with Main | Phone | Email | Drivers workspace switcher.',
      },
    ],
  },
  {
    id: 'dispatch-trip-queue-lifecycle',
    portal: 'dispatch',
    title: 'Trip Queue & Status Lifecycle',
    summary:
      'Triage incoming rides, filter and sort the Trip Queue, run batch operations, and track every trip status from Unconfirmed through Completed.',
    category: 'Operations',
    tags: [
      'trip queue',
      'status',
      'lifecycle',
      'unconfirmed',
      'confirmed',
      'offered',
      'assigned',
      'en route',
      'arrived',
      'in progress',
      'late',
      'batch',
    ],
    contextKeys: ['dispatch:queue', 'dispatch:trips'],
    steps: [
      {
        title: 'Triage Unconfirmed rides first',
        description:
          'Watch the pulsing Unconfirmed badge and filter pill at the top of the Trip Queue. Review passenger, fare, and pickup time details, then confirm or edit the booking.',
      },
      {
        title: 'Filter by status, date range, and search',
        description:
          'Use the status pills (All, Unconfirmed, Pending, Assigned, Completed, Cancelled, Unassigned), the date range picker, or press / (or Ctrl/Cmd+K) to search by trip ID, passenger name, phone, or address.',
      },
      {
        title: 'Switch queue layouts and customize columns',
        description:
          'Use the Trip Queue toolbar to toggle between Table View, Compact List, and Cards Grid, and pick visible columns from the Columns dropdown.',
      },
      {
        title: 'Inspect Trip Details, Audit Trail, or Batch Actions',
        description:
          'Click a trip row/card to open the Trip Details drawer or Audit tab, or select multiple trips to open the Batch Action Bar for bulk confirmation, dispatch, or completion.',
      },
    ],
    reference: [
      {
        title: 'Dispatch Status Badge Lifecycle',
        rows: [
          {
            label: 'Unconfirmed',
            description: 'Awaiting dispatch review before entering active fulfillment.',
            badge: 'Action Needed',
            badgeVariant: 'warning',
          },
          {
            label: 'Confirmed / Pending',
            description: 'Reviewed and queued; ready for manual assignment or Auto-Pilot lead-window release.',
            badge: 'Ready',
            badgeVariant: 'success',
          },
          {
            label: 'Offered',
            description: 'Dispatched to a driver with an active response countdown.',
            badge: 'Cascade',
            badgeVariant: 'info',
          },
          {
            label: 'Assigned / Accepted',
            description: 'Assigned to a driver (and acknowledged by the driver in Accepted state).',
            badge: 'Assigned',
            badgeVariant: 'info',
          },
          {
            label: 'En Route / Arrived',
            description: 'Driver is traveling to pickup (En Route) or waiting on location (Arrived).',
          },
          {
            label: 'In Progress',
            description: 'Passenger is on board and trip is actively underway.',
            badge: 'Live',
            badgeVariant: 'success',
          },
          {
            label: 'Late',
            description: 'Dynamic alert badge shown when a trip passes its scheduled pickup time without pickup.',
            badge: 'SLA Alert',
            badgeVariant: 'danger',
          },
          {
            label: 'Completed / Cancelled / Declined',
            description: 'Terminal or declined states; Declined returns the trip for re-assignment.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why did Completed or Cancelled rides disappear from my queue?',
        answer:
          'By default the queue filters to active statuses so dispatchers can focus on live work. Click the Completed, Cancelled, or All filter pill to view closed trips.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/trip-queue-lifecycle.png',
        alt: 'Dispatch Trip Queue table with status filter pills, search bar, and status badges',
        caption: 'Trip Queue toolbar, quick status filters, and live DispatchStatusBadge indicators.',
      },
    ],
  },
  {
    id: 'dispatch-driver-assignment-conflicts',
    portal: 'dispatch',
    title: 'Driver Assignment & Conflict Resolution',
    summary:
      'Assign or stage drivers on scheduled rides, control Auto-Pilot lead windows, and resolve Staged Driver Placeholder conflicts cleanly.',
    category: 'Operations',
    tags: [
      'driver assignment',
      'staged driver',
      'conflict resolution',
      'auto-pilot',
      'lead window',
      'keep staged',
      'skip staged',
      'override staged',
    ],
    contextKeys: ['dispatch:assignment', 'dispatch:conflicts'],
    steps: [
      {
        title: 'Assign or stage a driver from the queue',
        description:
          'Click the driver assignment control on any trip row to pick an available driver immediately, or stage a planned driver placeholder (📌) on an upcoming scheduled trip.',
      },
      {
        title: 'Manage Auto-Pilot & pre-pickup lead windows',
        description:
          'When automation is enabled, use the header ⚡ Auto-Pilot: ON / ⏸ Auto-Pilot: PAUSED toggle to pause or resume automated offering during surge periods.',
      },
      {
        title: 'Resolve Staged Driver Placeholder prompts',
        description:
          'When running Auto-Dispatch across trips that already have 📌 staged drivers, the "Staged Driver Placeholders Detected" window appears with three explicit strategies.',
        tip: 'Choose "Keep Staged (Send to Staged Driver)" (Recommended) to honor planned driver pairings while auto-dispatching any remaining unstaged trips.',
      },
    ],
    reference: [
      {
        title: 'Staged Driver Conflict Resolution Options',
        rows: [
          {
            label: 'Keep Staged (Send to Staged Driver)',
            description:
              'Sends staged trips directly to their planned driver and runs Auto-Dispatch on remaining unstaged trips.',
            badge: 'Recommended',
            badgeVariant: 'info',
          },
          {
            label: 'Skip Staged Trips',
            description:
              'Leaves staged trips held in Dispatch untouched and runs Auto-Dispatch only on unstaged trips.',
          },
          {
            label: 'Override Staged & Re-Rank',
            description:
              'Clears staged driver placeholders and runs fresh Auto-Dispatch candidate ranking across all selected trips.',
            badge: 'Override',
            badgeVariant: 'warning',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'What is the difference between staging a driver and assigning a driver?',
        answer:
          'Staging attaches a planned driver placeholder (📌) ahead of time in Dispatch without pushing an immediate active offer until you release it (or auto-release triggers inside the configured lead window).',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/driver-assignment-conflicts.png',
        alt: 'Driver assignment dropdown and Staged Driver Placeholders Detected resolution modal',
        caption: 'Assigning drivers and resolving staged driver placeholders during Auto-Dispatch.',
      },
    ],
  },
  {
    id: 'dispatch-live-map-roster',
    portal: 'dispatch',
    title: 'Live Map & Roster',
    summary:
      'Track real-time vehicle positions, inspect active routes and geofence zones on the Live Map, manage the Drivers Roster, and broadcast Fleet Tactical Alerts.',
    category: 'Fleet & Map',
    tags: [
      'live map',
      'drivers',
      'roster',
      'telemetry',
      'pins',
      'route',
      'zones',
      'tactical alerts',
      'broadcast',
    ],
    contextKeys: ['dispatch:drivers', 'dispatch:map', 'dispatch:alerts', 'dispatch:fleet'],
    steps: [
      {
        title: 'Inspect routes and vehicle markers on the Live Map',
        description:
          'Select any trip in the queue (or enter pickup/dropoff in the Booking form) to preview its route on the Live Map. Click Green/Orange/Red route pins to view stop details.',
      },
      {
        title: 'Customize Map & Route Display overlays',
        description:
          'Open Dispatch Settings (gear icon) → Map & Route Display to toggle Cased Route & Arrows, Interactive Route Pins, and the floating Route Summary Pill.',
      },
      {
        title: 'Open the Live Drivers Roster',
        description:
          'Click Drivers in the top switcher (or press Alt+D) to view available, busy, and offline drivers, open a driver’s individual trip queue window, or check shift status.',
      },
      {
        title: 'Send Fleet Broadcasts & Tactical Alerts',
        description:
          'Click the bell icon (or press Alt+A) to open Fleet Tactical Alerts, broadcast a message to all drivers, pin critical notices, and set the auto-dismiss retention window (15m to 24h, or Never).',
      },
    ],
    reference: [
      {
        title: 'Map & Fleet Controls',
        rows: [
          {
            label: 'Cased Route & Arrows',
            description: 'Draws high-contrast route casing with directional travel chevrons.',
          },
          {
            label: 'Interactive Route Pins',
            description: 'Enables clickable Green (pickup), Orange (stop), and Red (dropoff) pin popovers.',
          },
          {
            label: 'Route Summary Pill',
            description: 'Displays leg count, mileage, and a 1-click Clear Route control on the map.',
          },
          {
            label: 'Fleet Tactical Alerts (Bell)',
            description: 'Driver broadcast feed supporting pinned alerts, read tracking, and auto-dismiss timers.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'What does the green number badge on the Drivers button represent?',
        answer:
          'It shows the real-time count of drivers currently marked Available on the live fleet map.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/live-map-roster.png',
        alt: 'Dispatch Live Map with route overlay HUD and Drivers Roster dock',
        caption: 'Live Map route preview paired with the Drivers Roster and Fleet Tactical Alerts.',
      },
    ],
  },
  {
    id: 'dispatch-comms-call-hud',
    portal: 'dispatch',
    title: 'Comms Hub & Call HUD',
    summary:
      'Handle inbound/outbound softphone calls, populate bookings from caller ID in one tap, and manage SMS threads, voicemails, and internal notes.',
    category: 'Communications',
    tags: ['comms', 'phone', 'call hud', 'softphone', 'sms', 'messages', 'voicemail', 'caller id'],
    contextKeys: ['dispatch:phone', 'dispatch:comms', 'dispatch:messages', 'dispatch:voicemail'],
    steps: [
      {
        title: 'Answer or place calls from the Call HUD & Phone Hub',
        description:
          'Incoming calls surface in the top Dispatch Header Call HUD with caller lookup. Click Phone in the top bar (or press Alt+P) to open the full softphone keypad and call log.',
      },
      {
        title: 'Populate a booking or open an active trip from a caller',
        description:
          'From the Call HUD or Comms thread header, click to populate the caller’s name, phone, and recent address into your active booking draft—or jump straight to editing their existing trip.',
      },
      {
        title: 'Triage All, Phone, Messages, and Voicemail tabs',
        description:
          'Filter conversations across All, Phone, Messages, and Voicemail inside Comms Hub. Press / while Comms Hub is visible to search contacts and message history.',
      },
      {
        title: 'Send SMS updates or log internal notes',
        description:
          'Select a contact thread, compose an SMS reply or internal dispatcher note, and press Ctrl+Enter (or Cmd+Enter) to send immediately.',
      },
    ],
    reference: [
      {
        title: 'Comms Hub Views',
        rows: [
          { label: 'All', description: 'Unified chronological feed of calls, SMS threads, and voicemails.' },
          { label: 'Phone', description: 'Softphone dialer keypad, missed calls badge, and call history.' },
          { label: 'Messages', description: 'Two-way passenger/driver SMS threads and New Message composer.' },
          { label: 'Voicemail', description: 'Recorded caller voicemails awaiting callback or booking creation.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I silence ringtones on a shared workstation without closing Comms Hub?',
        answer:
          'Click the Sound Notification Toggle button (speaker/bell icon) in the top-right Dispatch header to mute inbound rings and ASAP chimes.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/comms-call-hud.png',
        alt: 'Comms Hub phone/SMS threads and top header Call HUD',
        caption: 'Top-bar Call HUD and split Comms Hub showing Phone, Messages, and Voicemail.',
      },
    ],
  },
  {
    id: 'dispatch-email-standing-orders',
    portal: 'dispatch',
    title: 'Email Dock & Standing Orders',
    summary:
      'Triage inbound booking emails with 1-click draft population, and manage recurring passenger or corporate ride schedules in the Series drawer.',
    category: 'Communications',
    tags: ['email', 'inbox', 'standing orders', 'series', 'recurring rides', 'populate booking'],
    contextKeys: ['dispatch:email', 'dispatch:standing-orders', 'dispatch:series'],
    steps: [
      {
        title: 'Open the Email Dock',
        description:
          'Click Email in the top switcher (or press Alt+E) to view inbound booking requests, corporate inquiries, and thread history.',
      },
      {
        title: 'Convert an email into a booking draft',
        description:
          'Open an inquiry in the Email Reader Pane and trigger Populate Booking to copy parsed sender contact and trip details into the left-hand Dispatch Booking Engine.',
      },
      {
        title: 'Reply inline or compose new dispatch emails',
        description:
          'Reply directly in the thread (with automatic dispatch signature) and press Ctrl+Enter / Cmd+Enter to send.',
      },
      {
        title: 'Manage recurring schedules via 🔁 Series',
        description:
          'Click the green 🔁 Series button in the top-right Dispatch header to open the Standing Orders & Recurring Rides Series Manager drawer, where you can create, pause, edit, or stage drivers on recurring ride templates.',
      },
    ],
    reference: [
      {
        title: 'Email & Recurring Series Tools',
        rows: [
          {
            label: 'Email Dock (Alt+E)',
            description: 'Folder toolbar, message list, reader pane, cross-channel contact rail, and composer.',
          },
          {
            label: 'Populate Booking',
            description: 'Transfers sender details from an email inquiry into the active Dispatch booking draft.',
            badge: '1-Click',
            badgeVariant: 'info',
          },
          {
            label: '🔁 Series Button',
            description: 'Opens StandingOrdersDrawer to manage recurring weekday/weekly ride schedules.',
            badge: 'Recurring',
            badgeVariant: 'success',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I open a specific Standing Order series directly from a generated trip?',
        answer:
          'Yes. Trips generated from a recurring schedule link back to their parent series and open the Standing Orders drawer focused on that series.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/email-standing-orders.png',
        alt: 'Dispatch Email Dock and Standing Orders Series Manager drawer',
        caption: 'Email Dock reader/composer and the 🔁 Series Standing Orders drawer.',
      },
    ],
  },
  {
    id: 'dispatch-keyboard-shortcuts',
    portal: 'dispatch',
    title: 'Keyboard Shortcuts',
    summary:
      'Speed up high-volume phone and queue operations using global workspace hotkeys, booking form shortcuts, and composer keybindings.',
    category: 'Reference',
    tags: ['shortcuts', 'hotkeys', 'keyboard', 'alt+p', 'alt+e', 'alt+d', 'alt+a', 'alt+s', 'ctrl+k', 'ctrl+enter'],
    contextKeys: ['dispatch:shortcuts'],
    shortcuts: [
      {
        keys: ['Ctrl / Cmd', 'K'],
        action: 'Expand and focus the Trip Queue search bar from anywhere in Dispatch.',
        scope: 'Global Workspace',
      },
      {
        keys: ['/'],
        action: 'Focus search in Trip Queue, Comms Hub, or Email Dock (when not typing in a field).',
        scope: 'Queue / Comms / Email',
      },
      {
        keys: ['M'],
        action: 'Return to Main 3-pane console (closes the active right-hand dock).',
        scope: 'Global (outside inputs)',
      },
      {
        keys: ['Alt', 'P'],
        action: 'Toggle Phone & Messages Hub (CommsHub). Also works with Alt+C, or P / C outside inputs.',
        scope: 'Global Workspace',
      },
      {
        keys: ['Alt', 'E'],
        action: 'Toggle Email Inbox dock (or press E outside inputs).',
        scope: 'Global Workspace',
      },
      {
        keys: ['Alt', 'D'],
        action: 'Toggle Live Fleet Drivers Roster dock (or press D outside inputs).',
        scope: 'Global Workspace',
      },
      {
        keys: ['Alt', 'A'],
        action: 'Toggle Fleet Tactical Alerts & Broadcasts popover (or press A outside inputs).',
        scope: 'Global Workspace',
      },
      {
        keys: ['Alt', 'S'],
        action: 'Swap Pickup and Dropoff addresses inside the Dispatch Booking Engine.',
        scope: 'Booking Form',
      },
      {
        keys: ['Ctrl / Cmd', 'Enter'],
        action: 'Submit active Dispatch Booking form, send SMS/note in Comms Hub, or send Email reply.',
        scope: 'Booking / Comms / Email',
      },
      {
        keys: ['Esc'],
        action: 'Close active right dock, alerts/settings popovers, expanded search, or open modal.',
        scope: 'Global Workspace',
      },
    ],
    faqs: [
      {
        question: 'Why didn’t single-letter keys (M, P, E, D, A) switch docks while I was typing?',
        answer:
          'Single-letter shortcuts are intentionally suppressed whenever your cursor is inside an input, textarea, or select menu. Use the Alt+ combinations (Alt+P, Alt+E, Alt+D, Alt+A) to toggle docks while typing in a form.',
      },
    ],
    screenshots: [
      {
        src: '/images/help/dispatch/keyboard-shortcuts.png',
        alt: 'Dispatch Console keyboard shortcut overlay reference',
        caption: 'High-speed keyboard navigation across Queue, Booking, Comms, Email, and Fleet.',
      },
    ],
  },
];
