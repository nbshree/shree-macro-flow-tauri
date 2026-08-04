#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AutomationModule {
    GameRecorder,
    TradeAssistant,
    #[allow(dead_code)] // Reserved for the visual workflow runtime that will claim the same lock.
    VisualWorkflow,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AutomationLease {
    module: AutomationModule,
    id: u64,
}

impl AutomationLease {
    pub fn module(self) -> AutomationModule {
        self.module
    }

    pub fn id(self) -> u64 {
        self.id
    }
}

#[derive(Debug, Default)]
pub struct AutomationActivity {
    current: Option<AutomationLease>,
    next_id: u64,
}

impl AutomationActivity {
    pub fn claim(&mut self, module: AutomationModule) -> Option<AutomationLease> {
        if self.current.is_some() {
            return None;
        }
        self.next_id = self.next_id.wrapping_add(1);
        if self.next_id == 0 {
            self.next_id = 1;
        }
        let lease = AutomationLease {
            module,
            id: self.next_id,
        };
        self.current = Some(lease);
        Some(lease)
    }

    pub fn release(&mut self, lease: AutomationLease) -> bool {
        let Some(current) = self.current() else {
            return false;
        };
        if current.module() != lease.module() || current.id() != lease.id() {
            return false;
        }
        self.current = None;
        true
    }

    pub fn is_active(&self) -> bool {
        self.current().is_some()
    }

    pub fn current(&self) -> Option<AutomationLease> {
        self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_current_lease_can_release_activity() {
        let mut activity = AutomationActivity::default();
        let first = activity.claim(AutomationModule::GameRecorder).unwrap();

        assert!(activity.is_active());
        assert_eq!(activity.current(), Some(first));
        assert_eq!(first.module(), AutomationModule::GameRecorder);
        assert_eq!(activity.claim(AutomationModule::TradeAssistant), None);

        assert!(activity.release(first));
        let second = activity.claim(AutomationModule::TradeAssistant).unwrap();

        assert!(!activity.release(first));
        assert_eq!(activity.current(), Some(second));
        assert_ne!(first.id(), second.id());
        assert!(activity.release(second));
        assert!(!activity.is_active());
    }

    #[test]
    fn repeated_release_is_a_noop() {
        let mut activity = AutomationActivity::default();
        let lease = activity.claim(AutomationModule::GameRecorder).unwrap();

        assert!(activity.release(lease));
        assert!(!activity.release(lease));
        assert_eq!(activity.current(), None);
    }

    #[test]
    fn stale_lease_cannot_release_a_new_run_from_the_same_module() {
        let mut activity = AutomationActivity::default();
        let stale = activity.claim(AutomationModule::GameRecorder).unwrap();
        assert!(activity.release(stale));

        let current = activity.claim(AutomationModule::GameRecorder).unwrap();

        assert_ne!(stale.id(), current.id());
        assert!(!activity.release(stale));
        assert_eq!(activity.current(), Some(current));
    }
}
