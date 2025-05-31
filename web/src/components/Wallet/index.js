// web/src/components/Wallet/index.js
import React from 'react';
import PerfectScrollbar from 'perfect-scrollbar';
import Selector from '../Selector';
import Tokens from './Tokens';
import Wrap from './Wrap';
import MarginAccounts from './MarginAccounts'; // Import new component
import './styles.scss';

const OPTIONS = [
  { value: 'tokens', name: 'Spot Balances' }, // Renamed for clarity
  { value: 'margin', name: 'Margin Accounts' }, // New Tab
  { value: 'wrap', name: 'Wrap ETH' },      // Renamed for clarity
  { value: 'unwrap', name: 'Unwrap WETH' }  // Renamed for clarity
];

class Wallet extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      selectedTab: OPTIONS[0].value // Default to first tab
    };
    this.ps = null;
    this.scrollableContainer = null; // Added to store ref
  }

  componentWillUnmount() {
    if (this.ps) {
      this.ps.destroy();
      this.ps = null;
    }
  }

  render() {
    const { selectedTab } = this.state;
    return (
      <>
        <div className="title flex justify-content-between align-items-center">
          <div>Wallet</div>
          <Selector
            options={OPTIONS}
            selectedValue={selectedTab}
            handleClick={option => {
              this.setState({ selectedTab: option.value });
            }}
          />
        </div>
        <div className="flex-column flex-1 position-relative overflow-hidden" ref={this.setRef}>
          {this.renderTabPanel()}
        </div>
      </>
    );
  }

  renderTabPanel() {
    const { selectedTab } = this.state;
    switch (selectedTab) {
      case 'tokens':
        return <Tokens />;
      case 'margin': // New case
        return <MarginAccounts />;
      case 'wrap':
        return <Wrap type="wrap" />;
      case 'unwrap':
        return <Wrap type="unwrap" />;
      default:
        return <Tokens />;
    }
  }

  setRef = (ref) => {
    if (ref) {
        this.scrollableContainer = ref; // Store the DOM element
        if (this.ps) { // Destroy existing if any
            this.ps.destroy();
        }
        this.ps = new PerfectScrollbar(ref, {
            suppressScrollX: true,
            maxScrollbarLength: 20
        });
    } else {
         if (this.ps) {
            this.ps.destroy();
            this.ps = null;
         }
         this.scrollableContainer = null; // Clear stored ref
    }
  }
}

export default Wallet;
