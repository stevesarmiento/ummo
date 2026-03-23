'use client';

import { useConnector } from '@solana/connector/react';
import { Button } from '@ummo/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@ummo/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@ummo/ui/avatar';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { WalletModal } from './wallet-modal';
import { WalletDropdownContent } from './wallet-dropdown-content';
import { Wallet, ChevronDown } from 'lucide-react';
import { Spinner } from '@ummo/ui/spinner';
import { cn } from '@ummo/ui/cn';

interface ConnectButtonProps {
    className?: string;
}

export function ConnectButton({ className }: ConnectButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const { isConnected, isConnecting, account, connector } = useConnector();

    // Prevent stale UI state from persisting across disconnect/reconnect cycles.
    useEffect(() => {
        // Always close the dropdown when connection state changes.
        setTimeout(() => {
            setIsDropdownOpen(false);
        }, 0);
        // Ensure we don't re-open the modal on the next reconnect due to stale state.
        setTimeout(() => {
            setIsModalOpen(false);
        }, 0);
    }, [isConnected]);

    // If the active account changes (new wallet), don't "stick" the dropdown open.
    useEffect(() => {
        setTimeout(() => {
            setIsDropdownOpen(false);
        }, 0);
    }, [account, connector?.id]);

    if (isConnected && account && connector) {
        const shortAddress = `${account.slice(0, 4)}...${account.slice(-4)}`;
        const walletIcon = connector.icon || undefined;

        return (
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('gap-2', className)}>
                        <Avatar className="h-5 w-5">
                            {walletIcon && <AvatarImage src={walletIcon} alt={connector.name} />}
                            <AvatarFallback>
                                <Wallet className="h-3 w-3" />
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{shortAddress}</span>
                        <motion.div
                            animate={{ rotate: isDropdownOpen ? -180 : 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                        >
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </motion.div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="p-0 rounded-[20px]">
                    <WalletDropdownContent
                        selectedAccount={account}
                        walletIcon={walletIcon}
                        walletName={connector.name}
                        onRequestClose={() => setIsDropdownOpen(false)}
                    />
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    // Show loading button when connecting (but modal stays rendered)
    const buttonContent = isConnecting ? (
        <>
            <Spinner className="h-4 w-4" />
            <span className="text-xs">Connecting...</span>
        </>
    ) : (
        'Connect Wallet'
    );

    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setIsModalOpen(true)} className={className}>
                {buttonContent}
            </Button>
            <WalletModal
                open={isModalOpen}
                onOpenChange={open => {
                    setIsModalOpen(open);
                }}
            />
        </>
    );
}
