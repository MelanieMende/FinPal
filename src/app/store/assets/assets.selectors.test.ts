import * as assetsSelector from './assets.selectors'

describe('Assets selectors', () => {

	describe('get_current_shares_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.current_shares == 0', () => {
			const asset = {
        current_shares: 0,
      } as Asset
			expect(assetsSelector.get_current_shares_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.current_shares != 0', () => {
			const asset = {
        current_shares: 1,
      } as Asset
			expect(assetsSelector.get_current_shares_textColor(asset)).toEqual("inherit")
		})

	})

	describe('get_current_invest_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.current_invest == 0', () => {
			const asset = {
        current_invest: 0,
      } as Asset
			expect(assetsSelector.get_current_invest_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.current_invest != 0', () => {
			const asset = {
				current_invest: 100,
			} as Asset
			expect(assetsSelector.get_current_invest_textColor(asset)).toEqual("inherit")
		})

	})

	describe('get_current_value(asset:Asset)', () => {

		it('should return (asset.current_shares * asset.price)', () => {
			const asset = {
        current_shares: 0.5,
        price: 100
      } as Asset
			expect(assetsSelector.get_current_value(asset)).toEqual(50)
		})

		it('should return 0 if no price is provided', () => {
			const asset = {
        current_shares: 0.5
      } as Asset
			expect(assetsSelector.get_current_value(asset)).toEqual(0)
		})

	})

	describe('get_current_value_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.current_shares == 0', () => {
			const asset = {
        current_shares: 0,
      } as Asset
			expect(assetsSelector.get_current_value_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.current_shares != 0', () => {
			const asset = {
				current_shares: 100,
				price: 10
			} as Asset
			expect(assetsSelector.get_current_value_textColor(asset)).toEqual("inherit")
		})

	})

	describe('get_current_profit_loss(asset:Asset)', () => {

		it('should return (asset.current_shares * asset.price) + asset.current_invest', () => {
			const asset = {
        current_shares: 0.5,
        price: 100,
        current_invest: -50
      } as Asset
			expect(assetsSelector.get_current_profit_loss(asset)).toEqual(0)
		})

		it('should return (asset.current_shares * 0) + asset.current_invest if no price is provided', () => {
			const asset = {
        current_shares: 0.5,
        current_invest: -50
      } as Asset
			expect(assetsSelector.get_current_profit_loss(asset)).toEqual(-50)
		})

	})

	describe('get_current_profit_loss_percentage(asset:Asset)', () => {

		it('should return 0 if asset.current_invest == 0', () => {
			const asset = {
        current_shares: 0.5,
        price: 100,
        current_invest: 0
      } as Asset
			expect(assetsSelector.get_current_profit_loss_percentage(asset)).toEqual(0)
		})

		it('should return (-1 * get_current_profit_loss(asset)/asset.current_invest * 100) if asset.current_invest != 0', () => {
			const asset = {
        current_shares: 0.5,
        price: 100,
        current_invest: -50
      } as Asset
			expect(assetsSelector.get_current_profit_loss_percentage(asset)).toEqual(0)
		})

	})

	describe('get_current_profit_loss_bgColor(asset:Asset)', () => {

		it('should return "bg-teal-600" if asset.current_profit_loss > 0', () => {
			const asset = {
        current_shares: 1,
        price: 100,
        current_invest: -50
      } as Asset
			expect(assetsSelector.get_current_profit_loss_bgColor(asset)).toEqual("bg-teal-600")
		})

		it('should return "transparent" if asset.current_profit_loss == 0', () => {
			const asset = {
        current_shares: 1,
        price: 50,
        current_invest: -50
      } as Asset
			expect(assetsSelector.get_current_profit_loss_bgColor(asset)).toEqual("transparent")
		})

		it('should return "bg-custom-red" if asset.current_profit_loss < 0', () => {
			const asset = {
        current_shares: 1,
        price: 50,
        current_invest: -100
      } as Asset
			expect(assetsSelector.get_current_profit_loss_bgColor(asset)).toEqual("bg-custom-red")
		})

	})

	describe('get_current_profit_loss_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.current_profit_loss == 0', () => {
			const asset = {
				current_shares: 1,
				price: 50,
				current_invest: -50
			} as Asset
			expect(assetsSelector.get_current_profit_loss_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.current_profit_loss != 0', () => {
			const asset = {
				current_shares: 1,
				price: 100,
				current_invest: -50
			} as Asset
			expect(assetsSelector.get_current_profit_loss_textColor(asset)).toEqual("inherit")
		})
	})

	describe('get_current_sum_in_out_bgColor(asset:Asset)', () => {

		it('should return "bg-teal-600" if asset.current_sum_in_out > 0', () => {
			const asset = {
        current_sum_in_out: 100
      } as Asset
			expect(assetsSelector.get_current_sum_in_out_bgColor(50)).toEqual("bg-teal-600")
		})

		it('should return "bg-custom-red" if asset.current_profit_loss < 0', () => {
			const asset = {
        current_sum_in_out: -100
      } as Asset
			expect(assetsSelector.get_current_sum_in_out_bgColor(-50)).toEqual("bg-custom-red")
		})

		it('should return "inherit" if asset.current_profit_loss == 0', () => {
			const asset = {
				current_sum_in_out: 0
			} as Asset
			expect(assetsSelector.get_current_sum_in_out_bgColor(0)).toEqual("inherit")
		})

	})

	describe('get_ex_dividend_date_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.ex_dividend_date is in the past', () => {
			const asset = {
				ID: 1,
				name: 'Test Asset',
				symbol: 'TST',
				isin: 'US0000000001',
				exDividendDate: '2024-10-01'
			} as Asset
			expect(assetsSelector.get_ex_dividend_date_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.ex_dividend_date is in the future', () => {
			const asset = {
				ID: 1,
				name: 'Test Asset',
				symbol: 'TST',
				isin: 'US0000000001',
				exDividendDate: '2999-12-31T23:00:00.000Z'
			} as Asset
			expect(assetsSelector.get_ex_dividend_date_textColor(asset)).toEqual("inherit")
		})

	})

	describe('get_pay_dividend_date_textColor(asset:Asset)', () => {
		it('should return "text-slate-500" if asset.pay_dividend_date is in the past', () => {
			const asset = {
				ID: 1,
				name: 'Test Asset',
				symbol: 'TST',
				isin: 'US0000000001',
				payDividendDate: '2024-10-01'
			} as Asset
			expect(assetsSelector.get_pay_dividend_date_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.pay_dividend_date is in the future', () => {
			const asset = {
				ID: 1,
				name: 'Test Asset',
				symbol: 'TST',
				isin: 'US0000000001',
				payDividendDate: '2999-12-31T23:00:00.000Z'
			} as Asset
			expect(assetsSelector.get_pay_dividend_date_textColor(asset)).toEqual("inherit")
		})
	})

	describe('get_dividends_earned_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.dividends_earned <= 0', () => {
			const asset = {
				dividends_earned: 0,
			} as Asset
			expect(assetsSelector.get_dividends_earned_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.dividends_earned > 0', () => {
			const asset = {
				dividends_earned: 100,
			} as Asset
			expect(assetsSelector.get_dividends_earned_textColor(asset)).toEqual("inherit")
		})
	})

	describe('get_upcoming_dividends(asset:Asset)', () => {
		
		it('should return "{"is_estimated": true, "value": 0}" if asset.current_shares_before_ex_date <= 0', () => {
			const asset = {
				current_shares_before_ex_date: 0,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends(asset)).toEqual({"is_estimated": true, "value": 0})
		})

		it('should return "{"is_estimated": false, "value": 15}"', () => {
			const asset = {
        current_shares_before_ex_date: 10,
        next_estimated_dividend_per_share: 1.5,
      } as Asset
			expect(assetsSelector.get_upcoming_dividends(asset)).toEqual({"is_estimated": false, "value": 15})
		})

		it('should return "{"is_estimated": false, "value": 0}" if no next_estimated_dividend_per_share is provided', () => {
			const asset = {
				current_shares_before_ex_date: 10,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends(asset)).toEqual({"is_estimated": false, "value": 0})
		})

	})

	describe('get_upcoming_dividends_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if upcoming_dividends.value <= 0', () => {
			const asset = {
				current_shares_before_ex_date: 0,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if upcoming_dividends.is_estimated == false', () => {
			const asset = {
				current_shares_before_ex_date: 10,
				next_estimated_dividend_per_share: 1.5,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends_textColor(asset)).toEqual("inherit")
		})
	})

	describe('get_upcoming_dividends_per_share_textColor(asset:Asset)', () => {

		it('should return "text-slate-500" if asset.next_estimated_dividend_per_share <= 0', () => {
			const asset = {
				next_estimated_dividend_per_share: 0,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends_per_share_textColor(asset)).toEqual("text-slate-500")
		})

		it('should return "inherit" if asset.next_estimated_dividend_per_share > 0', () => {
			const asset = {
				next_estimated_dividend_per_share: 1.5,
			} as Asset
			expect(assetsSelector.get_upcoming_dividends_per_share_textColor(asset)).toEqual("inherit")
		})
	})

	describe('get_estimated_dividends_per_year(asset:Asset)', () => {

		it('should return 0 if upcoming_dividends.value <= 0', () => {
			const asset = {
				current_shares_before_ex_date: 0,
			} as Asset
			expect(assetsSelector.get_estimated_dividends_per_year(asset)).toEqual(0)
		})

		it('should return upcoming_dividends.value if asset.dividendFrequency == "annually"', () => {
			const asset = {
				current_shares_before_ex_date: 10,
				next_estimated_dividend_per_share: 1.5,
				dividendFrequency: 'annually'
			} as Asset
			expect(assetsSelector.get_estimated_dividends_per_year(asset)).toEqual(15)
		})

		it('should return upcoming_dividends.value * 2 if asset.dividendFrequency == "biannually"', () => {
			const asset = {
				current_shares_before_ex_date: 10,
				next_estimated_dividend_per_share: 1.5,
				dividendFrequency: 'biannually'
			} as Asset
			expect(assetsSelector.get_estimated_dividends_per_year(asset)).toEqual(30)
		})

		it('should return upcoming_dividends.value * 4 if asset.dividendFrequency == "quarterly"', () => {
			const asset = {
				current_shares_before_ex_date: 10,
				next_estimated_dividend_per_share: 1.5,
				dividendFrequency: 'quarterly'
			} as Asset
			expect(assetsSelector.get_estimated_dividends_per_year(asset)).toEqual(60)
		})
	})

	describe('get_dividend_yield_formatted(asset:Asset)', () => {
		
		it('should return "" if asset.dividendYield is undefined', () => {
			const asset = {
			} as Asset
			expect(assetsSelector.get_dividend_yield_formatted(asset)).toEqual("")
		})

		it('should return formatted dividend yield string if asset.dividendYield is defined', () => {
			const asset = {
				dividendYield: 0.03456,
			} as Asset
			expect(assetsSelector.get_dividend_yield_formatted(asset)).toEqual("3.46 %")
		})
	})

	describe('selectAssetsWithUpcomingDividends(state: Assets[])', () => {

		it('should return [] if state is undefined', () => {
			expect(assetsSelector.selectAssetsWithUpcomingDividends(undefined)).toEqual([])
		})

		it('should only return assets with upcoming dividends', () => {

			const assets = [
				{
					ID: 1,
					name: 'Coca-Cola',
					current_shares_before_ex_date: 10,
					next_estimated_dividend_per_share: 1.5,
					payDividendDate: new Date('2999-12-31T23:00:00.000Z') // tomorrow
				},
				{
					ID: 2,
					name: '3M',
					current_shares_before_ex_date: 0
				},
				,
				{
					ID: 3,
					name: 'Amazon',
					current_shares_before_ex_date: 5,
					next_estimated_dividend_per_share: 0
				}
			] as Asset[]
			expect(assetsSelector.selectAssetsWithUpcomingDividends(assets)).toEqual(
				[
					{"ID": 1, "name":'Coca-Cola', "current_shares_before_ex_date": 10, "next_estimated_dividend_per_share": 1.5, payDividendDate: new Date('2999-12-31T23:00:00.000Z')},
					
				]
			)
		})

	})

	describe('selectAssetsSortedByName(state: Assets[], direction:\'asc\'|\'desc\')', () => {

		it('should return [] if state is undefined', () => {
		
			expect(assetsSelector.selectAssetsSortedByName(undefined, 'asc')).toEqual([])
			expect(assetsSelector.selectAssetsSortedByName(undefined, 'desc')).toEqual([])
		
		})

		it('should return assets sorted by name', () => {

			const assets = [
				{
					ID: 1,
					name: 'Coca-Cola'
				},
				{
					ID: 2,
					name: '3M'
				},
				,
				{
					ID: 3,
					name: 'Amazon'
				}
			] as Asset[]
			expect(assetsSelector.selectAssetsSortedByName(assets, 'asc')).toEqual(
				[
					{"ID": 2, "name": '3M'}, 
					{"ID": 3, "name":'Amazon'},
					{"ID": 1, "name":'Coca-Cola'}
				]
			)
			expect(assetsSelector.selectAssetsSortedByName(assets, 'desc')).toEqual(
				[
					{"ID": 1, "name":'Coca-Cola'},
					{"ID": 3, "name":'Amazon'},
					{"ID": 2, "name": '3M'}
				]
			)
		})

	})

	describe('selectAssetsSortedByDividendPayDate(state: Assets[], direction:\'asc\'|\'desc\')', () => {

		it('should return [] if state is undefined', () => {
		
			expect(assetsSelector.selectAssetsSortedByDividendPayDate(undefined, 'asc')).toEqual([])
			expect(assetsSelector.selectAssetsSortedByDividendPayDate(undefined, 'desc')).toEqual([])
		
		})

		it('should return assets sorted by dividendPayDate', () => {

			const assets = [
				{
					ID: 1,
					payDividendDate: '2024-10-01'
				},
				{
					ID: 2,
					payDividendDate: '2024-11-01'
				},
				,
				{
					ID: 3,
					payDividendDate: '2024-12-01'
				}
			] as Asset[]
			expect(assetsSelector.selectAssetsSortedByDividendPayDate(assets, 'asc')).toEqual(
				[
					{"ID": 1, "payDividendDate":'2024-10-01'}, 
					{"ID": 2, "payDividendDate":'2024-11-01'},
					{"ID": 3, "payDividendDate":'2024-12-01'}
				]
			)
			expect(assetsSelector.selectAssetsSortedByDividendPayDate(assets, 'desc')).toEqual(
				[
					{"ID": 3, "payDividendDate":'2024-12-01'},
					{"ID": 2, "payDividendDate":'2024-11-01'},
					{"ID": 1, "payDividendDate":'2024-10-01'}
				]
			)
		})

	})

	describe('selectAssetsSortedByProfitLoss(state: Assets[], direction:\'asc\'|\'desc\')', () => {

		describe('selectAssetsSortedByProfitLoss - asc', () => {

			it('should return active assets, sorted ascending by profit_loss_percentage, and then inactive assets', () => {

				const assets = [
					{
						ID: 1,
						current_shares: 0,
						price: 100,
						current_invest: 0
					},
					{
						ID: 2,
						current_shares: 3,
						price: 100,
						current_invest: -50
					},
					{
						ID: 3,
						current_shares: 1,
						price: 100,
						current_invest: -50
					},
					{
						ID: 4,
						current_shares: 2,
						price: 100,
						current_invest: -50
					},
				] as Asset[]
				expect(assetsSelector.selectAssetsSortedByProfitLoss(assets, 'asc')).toEqual(
					[
						{"ID": 3, "current_invest": -50, "current_shares": 1, "price": 100},
						{"ID": 4, "current_invest": -50, "current_shares": 2, "price": 100},
						{"ID": 2, "current_invest": -50, "current_shares": 3, "price": 100},
						{"ID": 1, "current_invest": 0, "current_shares": 0, "price": 100}
					]
				)
			})

		})

		describe('selectAssetsSortedByProfitLoss - desc', () => {

			it('should return active assets, sorted descending by profit_loss_percentage, and then inactive assets', () => {

				const assets = [
					{
						ID: 1,
						current_shares: 0,
						price: 100,
						current_invest: 0
					},
					{
						ID: 2,
						current_shares: 3,
						price: 100,
						current_invest: -50
					},
					{
						ID: 3,
						current_shares: 1,
						price: 100,
						current_invest: -50
					},
					{
						ID: 4,
						current_shares: 2,
						price: 100,
						current_invest: -50
					}
				] as Asset[]
				expect(assetsSelector.selectAssetsSortedByProfitLoss(assets, 'desc')).toEqual(
					[
						{"ID": 2, "current_invest": -50, "current_shares": 3, "price": 100}, 
						{"ID": 4, "current_invest": -50, "current_shares": 2, "price": 100},
						{"ID": 3, "current_invest": -50, "current_shares": 1, "price": 100},
						{"ID": 1, "current_invest": 0, "current_shares": 0, "price": 100}
					]
				)
			})

		})
	})

})
