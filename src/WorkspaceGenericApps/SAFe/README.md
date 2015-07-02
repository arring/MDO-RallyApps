# SAFe Readme

## These SAFe apps require the following custom fields for your workspace:

	- c_MoSCoW on the lowest PortfolioItem (type: String)
	- c_TeamCommits on the lowest PortfolioItem, (type: Text)
	- c_Risks on the lowest PortfolioItem, (type: Text)
	- c_Dependencies on HierarchicalRequirement, (type: Text)
	
	c_MoSCoW: (Undefined|Must Have|Should Have|Could Have|Won't Have)
	
	c_TeamCommits:
	{
		<ProjectObjectID>: {
			Commitment: (Undecided|N/A|Committed|Not Committed),
			Expected: boolean (default false),
			Objective: string (default ""),
			CEComment: string (default "")
		}
	}
	
	c_Risks: 
	{
		<ProjectObjectID>: {
			<RiskID>:{
				Checkpoint: date in number form
				Contact: string
				Description: string
				Impact: string
				Status: (Undefined|Resolved|Owned|Accepted|Mitigated)
				Urgency: (All|Undefined|Hot|Watch|Simmer)
				MitigationPlan: string
			}
		}
	}
	
	c_Dependencies:
	{ 
		Predecessors: {
			<DependencyID>: {
				Description: string
				NeededBy: date in number form
				Status: (Done|Not Done)
				PredecessorItems: {
					<PredecessorItemID>: {
						PredecessorUserStoryObjectID: number
						PredecessorProjectObjectID: number
						Supported: (Undefined|Yes|No)
						Assigned: boolean
					}
				)
			}
		},
		Successors: {
			<DependencyID>: {
				SuccessorUserStoryObjectID: number
				SuccessorProjectObjectID: number
				Description: string
				NeededBy: date in number form
				Supported: (Undefined|Yes|No)
				Assigned: boolean
			}
		}
	}
	
## Extra Instructions

	- These SAFe apps require that you enter in your trains and portfolios in the 'Scrum Group Portfolio Config' app before hand

	- You need to give everyone editor access to their portfolio projects and projects they have to depend on
